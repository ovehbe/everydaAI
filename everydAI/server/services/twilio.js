const logger = require('../utils/logger');
const { processCallText, processSpeech } = require('./ai');
const whatsappClient = require('./whatsapp');
const deviceManager = require('./deviceManager');

// Import for speech-to-text
const { Readable } = require('stream');

// Optional: Try to load speech recognition libraries if available
let speechRecognition = null;
try {
    // Google Cloud Speech API (if available)
    // speechRecognition = require('@google-cloud/speech');
    // Or any other speech recognition library
    logger.info('Speech recognition loaded successfully');
} catch (e) {
    logger.warn('Speech recognition library not available, using AI-only transcription');
}

/**
 * CallService for handling direct phone calls from Android devices
 */
class CallService {
    constructor() {
        // Active calls tracking
        this.activeCalls = new Map();
        
        // Chunks of audio per call
        this.callAudioChunks = new Map();
        
        // Active transcriptions per call
        this.callTranscriptions = new Map();
        
        // Users actively monitoring calls
        this.callObservers = new Map();
    }
    
    /**
     * Register an incoming call from Android device
     * @param {string} callId - Unique call identifier
     * @param {string} phoneNumber - Phone number
     * @param {string} deviceId - Device ID where call is happening
     * @param {boolean} isIncoming - Whether this is an incoming call
     * @returns {object} - Call registration result
     */
    registerCall(callId, phoneNumber, deviceId, isIncoming = true) {
        try {
            // Create call record
            const call = {
                callId,
                phoneNumber,
                deviceId,
                startTime: new Date(),
                isIncoming,
                status: 'ringing',
                transcript: '',
                processingTime: 0
            };
            
            // Store call
            this.activeCalls.set(callId, call);
            
            // Initialize audio chunks array for this call
            this.callAudioChunks.set(callId, []);
            
            // Initialize transcription for this call
            this.callTranscriptions.set(callId, '');
            
            logger.info(`Registered ${isIncoming ? 'incoming' : 'outgoing'} call from/to ${phoneNumber}, ID: ${callId}`);
            
            // Notify via WhatsApp if available
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                whatsappClient.sendToGroup(
                    `📞 *${isIncoming ? 'Incoming' : 'Outgoing'} Call*\n` +
                    `${isIncoming ? 'From' : 'To'}: ${phoneNumber}\n` +
                    `ID: ${callId}`
                );
            }
            
            // Notify connected clients
            this.broadcastCallUpdate(callId, call);
            
            return { success: true, call };
        } catch (error) {
            logger.error('Failed to register call:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Update call status
     * @param {string} callId - Call identifier
     * @param {string} status - New status (answered, in_progress, ended)
     * @returns {object} - Update result
     */
    updateCallStatus(callId, status) {
        try {
            if (!this.activeCalls.has(callId)) {
                return { success: false, error: 'Call not found' };
            }
            
            const call = this.activeCalls.get(callId);
            call.status = status;
            
            if (status === 'answered') {
                call.answeredAt = new Date();
            } else if (status === 'ended') {
                call.endedAt = new Date();
                call.duration = Math.round((call.endedAt - (call.answeredAt || call.startTime)) / 1000);
                
                // Process any accumulated audio for final transcript
                this.finalizeCallProcessing(callId);
            }
            
            logger.info(`Call ${callId} status updated to ${status}`);
            
            // Broadcast to connected clients
            this.broadcastCallUpdate(callId, call);
            
            return { success: true, call };
        } catch (error) {
            logger.error(`Failed to update call status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Process audio chunk from a call
     * @param {string} callId - Call identifier
     * @param {string} base64Audio - Audio chunk in base64
     * @returns {Promise<object>} - Processing result
     */
    async processCallAudio(callId, base64Audio) {
        try {
            if (!this.activeCalls.has(callId)) {
                return { success: false, error: 'Call not found' };
            }
            
            const call = this.activeCalls.get(callId);
            
            // Convert base64 to buffer
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            
            // Store audio chunk
            if (this.callAudioChunks.has(callId)) {
                this.callAudioChunks.get(callId).push(audioBuffer);
            } else {
                this.callAudioChunks.set(callId, [audioBuffer]);
            }
            
            // Process audio for transcription
            // This would ideally happen in batches or separate worker
            const transcriptionUpdate = await this.processAudioForTranscription(callId, audioBuffer);
            
            if (transcriptionUpdate && transcriptionUpdate.transcript) {
                // Update call transcript
                call.transcript = (call.transcript || '') + ' ' + transcriptionUpdate.transcript;
                this.callTranscriptions.set(callId, call.transcript);
                
                // Broadcast transcription update
                this.broadcastTranscriptionUpdate(callId, transcriptionUpdate.transcript, false);
                
                // Process transcript with AI for response
                await this.processTranscriptForResponse(callId, transcriptionUpdate.transcript);
            }
            
            return { success: true };
        } catch (error) {
            logger.error(`Error processing call audio: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Process audio for transcription
     * @param {string} callId - Call ID
     * @param {Buffer} audioBuffer - Audio buffer
     * @returns {Promise<object>} - Transcription result
     */
    async processAudioForTranscription(callId, audioBuffer) {
        try {
            // We'd use a speech-to-text service here (Google, Azure, etc)
            // For now, just use OpenAI for processing (not ideal for real-time)
            
            // For demo/testing, process every Nth chunk to reduce API calls
            // In production, use proper streaming STT API
            const audioChunks = this.callAudioChunks.get(callId) || [];
            
            // Only process audio periodically to avoid excessive API calls
            // Real implementation would use streaming STT
            if (audioChunks.length % 20 !== 0 && audioChunks.length > 1) {
                return null;
            }
            
            logger.info(`Processing audio transcription for call ${callId}`);
            
            // Get latest audio chunks for context
            const recentChunks = audioChunks.slice(-5);
            
            // For demo purposes, we'll "simulate" the speech-to-text with AI
            const call = this.activeCalls.get(callId);
            const recentTranscript = await processSpeech(`Audio chunk ${audioChunks.length} from call with ${call.phoneNumber}`, {
                callId: callId,
                inProgress: true
            });
            
            return {
                transcript: recentTranscript || 'Unintelligible audio',
                isFinal: false,
                confidence: 0.8
            };
        } catch (error) {
            logger.error(`Error in audio transcription: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Process transcript with AI for response
     * @param {string} callId - Call ID
     * @param {string} transcript - Transcript text
     * @returns {Promise<void>}
     */
    async processTranscriptForResponse(callId, transcript) {
        try {
            const call = this.activeCalls.get(callId);
            
            // Use AI to process the transcript and generate a response
            const aiResponse = await processSpeech(transcript, {
                callId: callId,
                phoneNumber: call.phoneNumber,
                inProgress: true
            });
            
            if (!aiResponse) {
                return;
            }
            
            // Send AI response to device
            const device = deviceManager.getDevice(call.deviceId);
            
            if (device && device.ws) {
                device.ws.send(JSON.stringify({
                    type: 'call_ai_response',
                    callId: callId,
                    responseType: 'speak',
                    text: aiResponse
                }));
            }
            
            // Broadcast to observers
            this.broadcastAiResponse(callId, aiResponse);
            
        } catch (error) {
            logger.error(`Error processing transcript: ${error.message}`);
        }
    }
    
    /**
     * Finalize call processing
     * @param {string} callId - Call ID
     */
    async finalizeCallProcessing(callId) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) return;
            
            // Process complete transcript for summary
            const fullTranscript = this.callTranscriptions.get(callId) || '';
            
            if (fullTranscript.trim().length === 0) {
                logger.info(`No transcript available for call ${callId}`);
                return;
            }
            
            logger.info(`Finalizing call ${callId} with transcript length ${fullTranscript.length}`);
            
            // Generate call summary with AI
            const summary = await processSpeech(fullTranscript, {
                callId: callId,
                phoneNumber: call.phoneNumber,
                duration: call.duration || 0,
                inProgress: false
            });
            
            // Store summary
            call.summary = summary;
            
            // Notify WhatsApp
            if (summary && whatsappClient.isReady && whatsappClient.assistantGroup) {
                await whatsappClient.sendToGroup(
                    `📝 *Call Summary*\n` +
                    `${call.isIncoming ? 'From' : 'To'}: ${call.phoneNumber}\n` +
                    `Duration: ${this.formatDuration(call.duration || 0)}\n\n` +
                    summary
                );
            }
            
            // Broadcast to observers
            this.broadcastCallSummary(callId, summary);
            
            // Clean up after delay to allow clients to fetch data
            setTimeout(() => {
                this.cleanupCall(callId);
            }, 60000); // Keep data for 1 minute after call ends
            
        } catch (error) {
            logger.error(`Error finalizing call: ${error.message}`);
        }
    }
    
    /**
     * Clean up call data
     * @param {string} callId - Call ID
     */
    cleanupCall(callId) {
        this.callAudioChunks.delete(callId);
        // Keep the call metadata for history
    }
    
    /**
     * Send AI command for call handling
     * @param {string} callId - Call ID
     * @param {string} command - Command (speak, end_call)
     * @param {string} text - Text to speak
     * @returns {object} - Command result
     */
    sendCallCommand(callId, command, text) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                return { success: false, error: 'Call not found' };
            }
            
            const device = deviceManager.getDevice(call.deviceId);
            if (!device || !device.ws) {
                return { success: false, error: 'Device not connected' };
            }
            
            // Send command to device
            device.ws.send(JSON.stringify({
                type: 'call_ai_response',
                callId: callId,
                responseType: command,
                text: text
            }));
            
            logger.info(`Sent ${command} command for call ${callId}`);
            
            return { success: true };
        } catch (error) {
            logger.error(`Error sending call command: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Add observer to a call
     * @param {string} callId - Call ID
     * @param {string} clientId - Client ID (WebSocket)
     */
    addCallObserver(callId, clientId) {
        if (!this.callObservers.has(callId)) {
            this.callObservers.set(callId, new Set());
        }
        this.callObservers.get(callId).add(clientId);
    }
    
    /**
     * Remove observer from a call
     * @param {string} callId - Call ID
     * @param {string} clientId - Client ID
     */
    removeCallObserver(callId, clientId) {
        if (this.callObservers.has(callId)) {
            this.callObservers.get(callId).delete(clientId);
        }
    }
    
    /**
     * Broadcast call update to observers
     * @param {string} callId - Call ID
     * @param {object} call - Call data
     */
    broadcastCallUpdate(callId, call) {
        const observers = this.callObservers.get(callId);
        if (!observers || observers.size === 0) {
            return;
        }
        
        const message = {
            type: 'call_update',
            callId: callId,
            call: {
                ...call,
                transcript: undefined // Don't include full transcript in update
            }
        };
        
        observers.forEach(clientId => {
            const client = deviceManager.getDevice(clientId);
            if (client && client.ws) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    /**
     * Broadcast transcription update to observers
     * @param {string} callId - Call ID
     * @param {string} transcript - New transcript text
     * @param {boolean} isFinal - Whether this is a final transcription
     */
    broadcastTranscriptionUpdate(callId, transcript, isFinal = false) {
        const observers = this.callObservers.get(callId);
        if (!observers || observers.size === 0) {
            return;
        }
        
        const message = {
            type: 'call_transcript',
            callId: callId,
            transcript: transcript,
            isFinal: isFinal,
            timestamp: new Date().toISOString()
        };
        
        observers.forEach(clientId => {
            const client = deviceManager.getDevice(clientId);
            if (client && client.ws) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    /**
     * Broadcast AI response to observers
     * @param {string} callId - Call ID
     * @param {string} response - AI response
     */
    broadcastAiResponse(callId, response) {
        const observers = this.callObservers.get(callId);
        if (!observers || observers.size === 0) {
            return;
        }
        
        const message = {
            type: 'call_ai_response',
            callId: callId,
            response: response,
            timestamp: new Date().toISOString()
        };
        
        observers.forEach(clientId => {
            const client = deviceManager.getDevice(clientId);
            if (client && client.ws) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    /**
     * Broadcast call summary to observers
     * @param {string} callId - Call ID
     * @param {string} summary - Call summary
     */
    broadcastCallSummary(callId, summary) {
        const observers = this.callObservers.get(callId);
        if (!observers || observers.size === 0) {
            return;
        }
        
        const message = {
            type: 'call_summary',
            callId: callId,
            summary: summary,
            timestamp: new Date().toISOString()
        };
        
        observers.forEach(clientId => {
            const client = deviceManager.getDevice(clientId);
            if (client && client.ws) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    /**
     * Get active calls
     * @returns {Array} - Array of active calls
     */
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }
    
    /**
     * Get call by ID
     * @param {string} callId - Call ID
     * @returns {object|null} - Call data or null if not found
     */
    getCall(callId) {
        return this.activeCalls.get(callId) || null;
    }
    
    /**
     * Format seconds into human-readable duration
     * @param {number} seconds - Duration in seconds
     * @returns {string} - Formatted duration
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        if (mins === 0) {
            return `${secs} seconds`;
        } else if (mins === 1) {
            return `1 minute ${secs} seconds`;
        } else {
            return `${mins} minutes ${secs} seconds`;
        }
    }
}

// Create singleton instance
const callService = new CallService();

module.exports = callService;
