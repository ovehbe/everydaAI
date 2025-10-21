const express = require('express');
const router = express.Router();
const { handleNotification, handleSMS, handleCall } = require('../handlers');
const deviceManager = require('../services/deviceManager');
const logger = require('../utils/logger');

/**
 * Process an event from the Android app
 */
router.post('/', async (req, res) => {
    try {
        const { type, data, deviceId, requestId } = req.body;
        
        // Validate input
        if (!type || !data) {
            return res.status(400).json({ error: 'Type and data are required' });
        }
        
        let device = null;
        
        // If deviceId is provided, find the device
        if (deviceId) {
            device = deviceManager.getDevice(deviceId);
        }
        
        let result;
        
        // Process different event types
        switch (type) {
            case 'notification':
                result = await handleNotification(data, device);
                break;
                
            case 'sms':
                result = await handleSMS(data, device);
                break;
                
            case 'call':
                result = await handleCall(data, device);
                break;
                
            default:
                logger.warn(`Unknown event type: ${type}`);
                return res.status(400).json({ error: 'Unknown event type' });
        }
        
        // Return result
        res.status(200).json({
            success: true,
            requestId,
            result
        });
    } catch (error) {
        logger.error('Error processing event:', error);
        res.status(500).json({ error: 'Failed to process event' });
    }
});

/**
 * Get device list
 */
router.get('/devices', (req, res) => {
    try {
        const devices = deviceManager.getAllDevices();
        
        res.status(200).json({
            count: devices.length,
            devices
        });
    } catch (error) {
        logger.error('Error getting devices:', error);
        res.status(500).json({ error: 'Failed to get devices' });
    }
});

/**
 * Send command to a device
 */
router.post('/devices/:id/command', (req, res) => {
    try {
        const { id } = req.params;
        const { command, data } = req.body;
        
        // Validate input
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }
        
        // Find device
        const device = deviceManager.getDevice(id);
        
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        
        // Send command
        const success = deviceManager.sendToDevice(id, {
            type: 'command',
            command,
            data
        });
        
        if (success) {
            res.status(200).json({
                success: true,
                message: `Command ${command} sent to device ${id}`
            });
        } else {
            res.status(500).json({ error: 'Failed to send command' });
        }
    } catch (error) {
        logger.error('Error sending command to device:', error);
        res.status(500).json({ error: 'Failed to send command' });
    }
});

/**
 * Broadcast message to all devices
 */
router.post('/broadcast', (req, res) => {
    try {
        const { message, type } = req.body;
        
        // Validate input
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Broadcast message
        const result = deviceManager.broadcastToAll({
            type: type || 'broadcast',
            message,
            timestamp: new Date().toISOString()
        });
        
        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Error broadcasting message:', error);
        res.status(500).json({ error: 'Failed to broadcast message' });
    }
});

module.exports = router;
