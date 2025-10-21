const express = require('express');
const router = express.Router();
const callService = require('../services/twilio'); // Still using the same file, but it's now a CallService
const logger = require('../utils/logger');

/**
 * Register a new call (from Android device)
 */
router.post('/register', (req, res) => {
    try {
        const { callId, phoneNumber, deviceId, isIncoming } = req.body;
        
        // Validate input
        if (!callId || !phoneNumber || !deviceId) {
            return res.status(400).json({ error: 'callId, phoneNumber, and deviceId are required' });
        }
        
        // Register call
        const result = callService.registerCall(callId, phoneNumber, deviceId, isIncoming !== false);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: `Call registered: ${callId}`
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to register call' });
        }
    } catch (error) {
        logger.error('Error registering call:', error);
        res.status(500).json({ error: 'Failed to register call' });
    }
});

/**
 * Update call status (from Android device)
 */
router.post('/status', (req, res) => {
    try {
        const { callId, status } = req.body;
        
        // Validate input
        if (!callId || !status) {
            return res.status(400).json({ error: 'callId and status are required' });
        }
        
        if (!['ringing', 'answered', 'in_progress', 'ended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Update status
        const result = callService.updateCallStatus(callId, status);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: `Call status updated: ${callId} -> ${status}`
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to update call status' });
        }
    } catch (error) {
        logger.error('Error updating call status:', error);
        res.status(500).json({ error: 'Failed to update call status' });
    }
});

/**
 * Process call audio (from Android device)
 */
router.post('/audio', async (req, res) => {
    try {
        const { callId, audio } = req.body;
        
        // Validate input
        if (!callId || !audio) {
            return res.status(400).json({ error: 'callId and audio are required' });
        }
        
        // Process audio
        const result = await callService.processCallAudio(callId, audio);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: `Audio processed for call: ${callId}`
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to process audio' });
        }
    } catch (error) {
        logger.error('Error processing call audio:', error);
        res.status(500).json({ error: 'Failed to process audio' });
    }
});

/**
 * Send command to call (from desktop/web client)
 */
router.post('/command', (req, res) => {
    try {
        const { callId, command, text } = req.body;
        
        // Validate input
        if (!callId || !command) {
            return res.status(400).json({ error: 'callId and command are required' });
        }
        
        if (!['speak', 'end_call'].includes(command)) {
            return res.status(400).json({ error: 'Invalid command' });
        }
        
        // Send command
        const result = callService.sendCallCommand(callId, command, text || '');
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: `Command sent: ${command} to call ${callId}`
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to send command' });
        }
    } catch (error) {
        logger.error('Error sending call command:', error);
        res.status(500).json({ error: 'Failed to send command' });
    }
});

/**
 * Get active calls
 */
router.get('/active', (req, res) => {
    try {
        // Get active calls
        const calls = callService.getActiveCalls();
        
        res.status(200).json({
            success: true,
            count: calls.length,
            calls
        });
    } catch (error) {
        logger.error('Error getting active calls:', error);
        res.status(500).json({ error: 'Failed to get active calls' });
    }
});

/**
 * Get specific call
 */
router.get('/:callId', (req, res) => {
    try {
        const { callId } = req.params;
        
        // Get call
        const call = callService.getCall(callId);
        
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }
        
        res.status(200).json({
            success: true,
            call
        });
    } catch (error) {
        logger.error('Error getting call:', error);
        res.status(500).json({ error: 'Failed to get call' });
    }
});

/**
 * Add call observer (for WebSocket clients)
 * Note: This is normally handled by WebSocket messages, but added here for completeness
 */
router.post('/:callId/observe', (req, res) => {
    try {
        const { callId } = req.params;
        const { clientId } = req.body;
        
        // Validate
        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }
        
        // Add observer
        callService.addCallObserver(callId, clientId);
        
        res.status(200).json({
            success: true,
            message: `Client ${clientId} now observing call ${callId}`
        });
    } catch (error) {
        logger.error('Error adding call observer:', error);
        res.status(500).json({ error: 'Failed to add observer' });
    }
});

module.exports = router;
