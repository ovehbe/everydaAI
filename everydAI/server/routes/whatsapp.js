const express = require('express');
const router = express.Router();
const whatsappClient = require('../services/whatsapp');
const logger = require('../utils/logger');

/**
 * Send a WhatsApp message
 */
router.post('/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        
        // Validate input
        if (!to || !message) {
            return res.status(400).json({ error: 'Recipient (to) and message are required' });
        }
        
        // Check if WhatsApp client is ready
        if (!whatsappClient.isReady) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        // Send message
        const success = await whatsappClient.sendMessage(to, message);
        
        if (success) {
            res.status(200).json({
                success: true,
                message: `Message sent to ${to}`
            });
        } else {
            res.status(500).json({ error: 'Failed to send message' });
        }
    } catch (error) {
        logger.error('Error sending WhatsApp message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

/**
 * Send a message to the assistant group
 */
router.post('/sendToGroup', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Validate input
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Check if WhatsApp client is ready
        if (!whatsappClient.isReady) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        // Check if assistant group exists
        if (!whatsappClient.assistantGroup) {
            return res.status(404).json({ error: 'Assistant group not found' });
        }
        
        // Send message
        const success = await whatsappClient.sendToGroup(message);
        
        if (success) {
            res.status(200).json({
                success: true,
                message: 'Message sent to assistant group'
            });
        } else {
            res.status(500).json({ error: 'Failed to send message' });
        }
    } catch (error) {
        logger.error('Error sending message to WhatsApp group:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

/**
 * Get WhatsApp status
 */
router.get('/status', (req, res) => {
    try {
        const status = {
            ready: whatsappClient.isReady,
            assistantGroup: Boolean(whatsappClient.assistantGroup),
            uptime: whatsappClient.getUptime()
        };
        
        res.status(200).json(status);
    } catch (error) {
        logger.error('Error getting WhatsApp status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

module.exports = router;
