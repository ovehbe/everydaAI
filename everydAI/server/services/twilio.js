const twilio = require('twilio');
const logger = require('../utils/logger');
const { processCallText, processSpeech } = require('./ai');
const whatsappClient = require('./whatsapp');

/**
 * TwilioService for handling phone calls
 */
class TwilioService {
    constructor() {
        // Initialize Twilio client
        this.client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        
        this.twilioPhone = process.env.TWILIO_PHONE_NUMBER;
        this.isConfigured = this.checkConfig();
        
        // Active calls tracking
        this.activeCalls = new Map();
    }
    
    /**
     * Check if Twilio is properly configured
     * @returns {boolean} - Configuration status
     */
    checkConfig() {
        if (!process.env.TWILIO_ACCOUNT_SID || 
            !process.env.TWILIO_AUTH_TOKEN ||
            !process.env.TWILIO_PHONE_NUMBER) {
            logger.warn('Twilio not fully configured - some features will be limited');
            return false;
        }
        return true;
    }
    
    /**
     * Make an outbound call
     * @param {string} to - Destination phone number
     * @param {object} options - Call options
     * @returns {Promise<object>} - Call resource
     */
    async makeCall(to, options = {}) {
        if (!this.isConfigured) {
            throw new Error('Twilio not configured');
        }
        
        try {
            const callOptions = {
                to: to,
                from: this.twilioPhone,
                twiml: this.generateInitialTwiML(options),
                statusCallback: options.statusCallbackUrl || `${process.env.BASE_URL}/api/calls/status`,
                statusCallbackMethod: 'POST',
                ...options
            };
            
            const call = await this.client.calls.create(callOptions);
            
            logger.info(`Initiated call to ${to}, SID: ${call.sid}`);
            
            // Track the call
            this.activeCalls.set(call.sid, {
                to,
                startTime: new Date(),
                status: 'initiated',
                options
            });
            
            // Notify via WhatsApp if available
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                whatsappClient.sendToGroup(`📞 *Outbound Call Initiated*\nTo: ${to}\nSID: ${call.sid}`);
            }
            
            return call;
        } catch (error) {
            logger.error('Failed to make Twilio call:', error);
            throw error;
        }
    }
    
    /**
     * Handle an incoming call (webhook handler)
     * @param {object} req - Express request
     * @param {object} res - Express response
     */
    handleIncomingCall(req, res) {
        logger.info(`Incoming call from ${req.body.From}`);
        
        try {
            const twiml = this.generateIncomingCallTwiML({
                from: req.body.From,
                callSid: req.body.CallSid
            });
            
            // Track the call
            this.activeCalls.set(req.body.CallSid, {
                from: req.body.From,
                startTime: new Date(),
                status: 'ringing',
                direction: 'inbound'
            });
            
            // Notify via WhatsApp if available
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                whatsappClient.sendToGroup(`📞 *Incoming Call*\nFrom: ${req.body.From}\nSID: ${req.body.CallSid}`);
            }
            
            // Respond with TwiML
            res.type('text/xml');
            res.send(twiml.toString());
        } catch (error) {
            logger.error('Error handling incoming call:', error);
            res.status(500).send('Error handling call');
        }
    }
    
    /**
     * Handle call status updates
     * @param {object} req - Express request
     * @param {object} res - Express response
     */
    handleCallStatus(req, res) {
        const { CallSid, CallStatus, From, To, CallDuration } = req.body;
        
        logger.info(`Call ${CallSid} status: ${CallStatus}, duration: ${CallDuration || 0}s`);
        
        // Update call tracking
        if (this.activeCalls.has(CallSid)) {
            const call = this.activeCalls.get(CallSid);
            call.status = CallStatus;
            call.duration = CallDuration;
            
            if (CallStatus === 'completed') {
                // Call ended, we can process transcripts, etc.
                this.processCompletedCall(CallSid, call);
            }
        }
        
        // Notify via WhatsApp for significant status changes
        if (['completed', 'failed', 'busy', 'no-answer'].includes(CallStatus)) {
            const from = From || 'Unknown';
            const to = To || 'Unknown';
            
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                whatsappClient.sendToGroup(
                    `📞 *Call ${CallStatus}*\n` +
                    `From: ${from}\n` +
                    `To: ${to}\n` +
                    `Duration: ${CallDuration || 0}s\n` +
                    `SID: ${CallSid}`
                );
            }
        }
        
        // Always respond with 200 OK
        res.status(200).send('OK');
    }
    
    /**
     * Process a completed call
     * @param {string} callSid - Call SID
     * @param {object} callInfo - Call information
     */
    async processCompletedCall(callSid, callInfo) {
        try {
            // Get call recordings if available
            const recordings = await this.client.recordings.list({ callSid });
            
            if (recordings.length > 0) {
                logger.info(`Found ${recordings.length} recordings for call ${callSid}`);
                
                // Process the recordings (transcribe, analyze, etc.)
                for (const recording of recordings) {
                    await this.processRecording(recording, callInfo);
                }
            }
            
            // Clean up
            this.activeCalls.delete(callSid);
        } catch (error) {
            logger.error(`Error processing completed call ${callSid}:`, error);
        }
    }
    
    /**
     * Process a call recording
     * @param {object} recording - Twilio recording resource
     * @param {object} callInfo - Call information
     */
    async processRecording(recording, callInfo) {
        try {
            // Get recording URL
            const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recording.sid}.mp3`;
            
            // Request transcription if not already transcribed
            if (!recording.transcriptionSid) {
                const transcription = await this.client.recordings(recording.sid)
                    .transcriptions
                    .create();
                
                logger.info(`Requested transcription for recording ${recording.sid}, transcription SID: ${transcription.sid}`);
                
                // Wait for transcription to complete (would be handled by webhook in production)
                // For now, we'll fetch it directly after a short delay
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const completedTranscription = await this.client.transcriptions(transcription.sid).fetch();
                
                if (completedTranscription.status === 'completed') {
                    // Process the transcript with AI
                    const transcript = completedTranscription.transcriptionText;
                    const response = await processSpeech(transcript, {
                        callSid: recording.callSid,
                        from: callInfo.from || callInfo.to,
                        duration: callInfo.duration || 0
                    });
                    
                    // Send the summary to WhatsApp
                    if (response && whatsappClient.isReady && whatsappClient.assistantGroup) {
                        await whatsappClient.sendToGroup(
                            `📝 *Call Summary*\n` +
                            `From: ${callInfo.from || callInfo.to}\n` +
                            `Duration: ${callInfo.duration || 0}s\n\n` +
                            response
                        );
                    }
                }
            }
        } catch (error) {
            logger.error(`Error processing recording ${recording.sid}:`, error);
        }
    }
    
    /**
     * Handle speech input from Twilio
     * @param {object} req - Express request
     * @param {object} res - Express response
     */
    async handleSpeechInput(req, res) {
        try {
            const { CallSid, SpeechResult } = req.body;
            
            logger.info(`Speech input for call ${CallSid}: ${SpeechResult}`);
            
            // Process the speech with AI
            const response = await processSpeech(SpeechResult, {
                callSid: CallSid,
                inProgress: true
            });
            
            // Generate TwiML response
            const twiml = new twilio.twiml.VoiceResponse();
            
            if (response) {
                // Say the AI response
                twiml.say({
                    voice: 'Polly.Joanna-Neural',
                    language: 'en-US'
                }, response);
                
                // Ask for more input
                twiml.gather({
                    input: 'speech',
                    speechTimeout: 2,
                    language: 'en-US',
                    action: '/api/calls/speech',
                    method: 'POST'
                });
            } else {
                // Fallback response
                twiml.say(
                    'I didn\'t catch that. Please try again or call back later.'
                );
                twiml.hangup();
            }
            
            // Respond with TwiML
            res.type('text/xml');
            res.send(twiml.toString());
        } catch (error) {
            logger.error('Error handling speech input:', error);
            
            // Fallback TwiML
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, there was an error processing your request.');
            twiml.hangup();
            
            res.type('text/xml');
            res.send(twiml.toString());
        }
    }
    
    /**
     * Generate initial TwiML for outbound calls
     * @param {object} options - Call options
     * @returns {twilio.twiml.VoiceResponse} - TwiML response
     */
    generateInitialTwiML(options = {}) {
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Add greeting
        twiml.say({
            voice: options.voice || 'Polly.Joanna-Neural',
            language: options.language || 'en-US'
        }, options.greeting || 'Hello, this is an automated call from everydAI.');
        
        // Add pause
        twiml.pause({ length: 1 });
        
        // Add message
        if (options.message) {
            twiml.say({
                voice: options.voice || 'Polly.Joanna-Neural',
                language: options.language || 'en-US'
            }, options.message);
        }
        
        // Gather speech input if interactive
        if (options.interactive) {
            twiml.gather({
                input: 'speech',
                speechTimeout: options.speechTimeout || 2,
                language: options.language || 'en-US',
                action: options.speechAction || '/api/calls/speech',
                method: 'POST'
            });
        }
        
        return twiml;
    }
    
    /**
     * Generate TwiML for incoming calls
     * @param {object} options - Call options
     * @returns {twilio.twiml.VoiceResponse} - TwiML response
     */
    generateIncomingCallTwiML(options = {}) {
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Add greeting
        twiml.say({
            voice: 'Polly.Joanna-Neural',
            language: 'en-US'
        }, 'Hello, you\'ve reached the everydAI assistant. How can I help you today?');
        
        // Gather speech input
        twiml.gather({
            input: 'speech',
            speechTimeout: 2,
            language: 'en-US',
            action: '/api/calls/speech',
            method: 'POST'
        });
        
        // If no input, add fallback
        twiml.say('I didn\'t hear anything. Please call back when you\'re ready.');
        
        return twiml;
    }
}

// Create singleton instance
const twilioService = new TwilioService();

module.exports = twilioService;
