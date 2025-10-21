const express = require('express');
const router = express.Router();
const twilioService = require('../services/twilio');
const logger = require('../utils/logger');

/**
 * Make an outbound call
 */
router.post('/make', async (req, res) => {
    try {
        const { to, message, greeting, interactive } = req.body;
        
        // Validate input
        if (!to) {
            return res.status(400).json({ error: 'Recipient (to) is required' });
        }
        
        // Check if Twilio is configured
        if (!twilioService.isConfigured) {
            return res.status(503).json({ error: 'Twilio not configured' });
        }
        
        // Make call
        const call = await twilioService.makeCall(to, {
            message,
            greeting,
            interactive: interactive || false
        });
        
        res.status(200).json({
            success: true,
            callSid: call.sid,
            message: `Call initiated to ${to}`
        });
    } catch (error) {
        logger.error('Error making call:', error);
        res.status(500).json({ error: 'Failed to make call' });
    }
});

/**
 * Handle incoming calls from Twilio webhook
 */
router.post('/incoming', (req, res) => {
    try {
        // Pass to Twilio service
        twilioService.handleIncomingCall(req, res);
    } catch (error) {
        logger.error('Error handling incoming call:', error);
        res.status(500).send('Error handling call');
    }
});

/**
 * Handle call status updates from Twilio webhook
 */
router.post('/status', (req, res) => {
    try {
        // Pass to Twilio service
        twilioService.handleCallStatus(req, res);
    } catch (error) {
        logger.error('Error handling call status:', error);
        res.status(500).send('Error handling call status');
    }
});

/**
 * Handle speech input from Twilio webhook
 */
router.post('/speech', (req, res) => {
    try {
        // Pass to Twilio service
        twilioService.handleSpeechInput(req, res);
    } catch (error) {
        logger.error('Error handling speech input:', error);
        res.status(500).send('Error handling speech input');
    }
});

module.exports = router;
