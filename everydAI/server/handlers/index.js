const logger = require('../utils/logger');
const { processNotification, processSMS, processSpeech } = require('../services/ai');
const whatsappClient = require('../services/whatsapp');
const twilioService = require('../services/twilio');
const deviceManager = require('../services/deviceManager');

/**
 * Handle notification events from the Android app
 * @param {object} data - Notification data
 * @param {object} device - Device that sent the notification
 * @returns {Promise<object>} - Processing result
 */
async function handleNotification(data, device) {
    try {
        logger.info(`Processing notification from ${data.packageName || 'unknown app'}`);
        
        // Process notification with AI
        const result = await processNotification(data);
        
        // Send result back to device if needed
        if (device && device.ws && device.ws.readyState === 1) {
            device.ws.send(JSON.stringify({
                type: 'notification_processed',
                requestId: data.requestId,
                result
            }));
        }
        
        return result;
    } catch (error) {
        logger.error('Error handling notification:', error);
        return { error: 'Failed to process notification' };
    }
}

/**
 * Handle SMS events from the Android app
 * @param {object} data - SMS data
 * @param {object} device - Device that sent the SMS
 * @returns {Promise<object>} - Processing result
 */
async function handleSMS(data, device) {
    try {
        logger.info(`Processing SMS from ${data.phoneNumber || 'unknown number'}`);
        
        // Process SMS with AI
        const result = await processSMS(data);
        
        // Send result back to device if needed
        if (device && device.ws && device.ws.readyState === 1) {
            device.ws.send(JSON.stringify({
                type: 'sms_processed',
                requestId: data.requestId,
                result
            }));
        }
        
        return result;
    } catch (error) {
        logger.error('Error handling SMS:', error);
        return { error: 'Failed to process SMS' };
    }
}

/**
 * Handle call events from the Android app
 * @param {object} data - Call data
 * @param {object} device - Device that sent the call event
 * @returns {Promise<object>} - Processing result
 */
async function handleCall(data, device) {
    try {
        logger.info(`Processing call event: ${data.callType} from ${data.phoneNumber}`);
        
        // Different handling based on call type
        switch (data.callType) {
            case 'CALL_INCOMING':
                return handleIncomingCall(data, device);
                
            case 'CALL_ANSWERED':
                return handleAnsweredCall(data, device);
                
            case 'CALL_ENDED':
                return handleEndedCall(data, device);
                
            default:
                logger.warn(`Unknown call type: ${data.callType}`);
                return { error: 'Unknown call type' };
        }
    } catch (error) {
        logger.error('Error handling call event:', error);
        return { error: 'Failed to process call event' };
    }
}

/**
 * Handle incoming call
 * @param {object} data - Call data
 * @param {object} device - Device that sent the call event
 * @returns {Promise<object>} - Processing result
 */
async function handleIncomingCall(data, device) {
    // Notify WhatsApp group if available
    if (whatsappClient.isReady && whatsappClient.assistantGroup) {
        await whatsappClient.sendToGroup(
            `📞 *Incoming Call*\n` +
            `From: ${data.phoneNumber}\n` +
            `Time: ${new Date().toLocaleTimeString()}`
        );
    }
    
    // No immediate AI processing needed for incoming calls
    return {
        status: 'notified',
        action: 'none'
    };
}

/**
 * Handle answered call
 * @param {object} data - Call data
 * @param {object} device - Device that sent the call event
 * @returns {Promise<object>} - Processing result
 */
async function handleAnsweredCall(data, device) {
    // Update WhatsApp group if available
    if (whatsappClient.isReady && whatsappClient.assistantGroup) {
        await whatsappClient.sendToGroup(
            `📞 *Call Answered*\n` +
            `With: ${data.phoneNumber}\n` +
            `Time: ${new Date().toLocaleTimeString()}`
        );
    }
    
    return {
        status: 'notified',
        action: 'none'
    };
}

/**
 * Handle ended call
 * @param {object} data - Call data
 * @param {object} device - Device that sent the call event
 * @returns {Promise<object>} - Processing result
 */
async function handleEndedCall(data, device) {
    try {
        // Only process calls with duration
        if (data.duration > 0) {
            // Notify WhatsApp group
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                await whatsappClient.sendToGroup(
                    `📞 *Call Ended*\n` +
                    `With: ${data.phoneNumber}\n` +
                    `Duration: ${formatDuration(data.duration)}\n` +
                    `Time: ${new Date().toLocaleTimeString()}`
                );
            }
            
            // For longer calls, we might want to generate a reminder or summary
            if (data.duration > 60) { // Calls longer than a minute
                const summary = `Call with ${data.phoneNumber} lasted ${formatDuration(data.duration)}.`;
                
                // If we had a transcript, we would process it here with AI
                if (data.transcript) {
                    const processed = await processSpeech(data.transcript, {
                        phoneNumber: data.phoneNumber,
                        duration: data.duration
                    });
                    
                    if (processed && whatsappClient.isReady && whatsappClient.assistantGroup) {
                        await whatsappClient.sendToGroup(
                            `📝 *Call Summary*\n` +
                            `With: ${data.phoneNumber}\n` +
                            `Duration: ${formatDuration(data.duration)}\n\n` +
                            processed
                        );
                    }
                }
            }
        }
        
        return {
            status: 'processed',
            action: 'none'
        };
    } catch (error) {
        logger.error('Error handling ended call:', error);
        return { error: 'Failed to process ended call' };
    }
}

/**
 * Format seconds into human-readable duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
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

module.exports = {
    handleNotification,
    handleSMS,
    handleCall
};
