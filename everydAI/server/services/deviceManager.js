const logger = require('../utils/logger');

/**
 * DeviceManager class to track connected devices
 */
class DeviceManager {
    constructor() {
        this.devices = new Map();
    }
    
    /**
     * Register a new device
     * @param {string} id - Unique device identifier
     * @param {WebSocket} ws - WebSocket connection
     * @returns {object} - Device object
     */
    registerDevice(id, ws) {
        const device = {
            id,
            ws,
            connectedAt: new Date(),
            lastActive: new Date(),
            deviceInfo: {},
            isActive: true
        };
        
        this.devices.set(id, device);
        logger.info(`Device registered: ${id}`);
        return device;
    }
    
    /**
     * Unregister a device
     * @param {string} id - Device identifier
     */
    unregisterDevice(id) {
        if (this.devices.has(id)) {
            this.devices.delete(id);
            logger.info(`Device unregistered: ${id}`);
        }
    }
    
    /**
     * Update device information
     * @param {string} id - Device identifier
     * @param {object} info - Device information
     */
    updateDeviceInfo(id, info) {
        if (this.devices.has(id)) {
            const device = this.devices.get(id);
            device.deviceInfo = { ...device.deviceInfo, ...info };
            device.lastActive = new Date();
            this.devices.set(id, device);
            logger.debug(`Device info updated: ${id}`);
        }
    }
    
    /**
     * Send message to a specific device
     * @param {string} id - Device identifier
     * @param {object} message - Message to send
     * @returns {boolean} - Success status
     */
    sendToDevice(id, message) {
        if (!this.devices.has(id)) {
            logger.warn(`Attempted to send message to unknown device: ${id}`);
            return false;
        }
        
        const device = this.devices.get(id);
        
        try {
            device.ws.send(JSON.stringify(message));
            device.lastActive = new Date();
            return true;
        } catch (error) {
            logger.error(`Failed to send message to device ${id}:`, error);
            return false;
        }
    }
    
    /**
     * Send message to all devices
     * @param {object} message - Message to send
     * @returns {object} - Status with success count and failed count
     */
    broadcastToAll(message) {
        let successCount = 0;
        let failedCount = 0;
        
        this.devices.forEach((device, id) => {
            try {
                device.ws.send(JSON.stringify(message));
                device.lastActive = new Date();
                successCount++;
            } catch (error) {
                logger.error(`Failed to broadcast to device ${id}:`, error);
                failedCount++;
            }
        });
        
        return { successCount, failedCount };
    }
    
    /**
     * Get all connected devices
     * @returns {Array} - List of connected devices (without WebSocket objects)
     */
    getAllDevices() {
        const deviceList = [];
        
        this.devices.forEach((device, id) => {
            const { ws, ...deviceInfo } = device;
            deviceList.push(deviceInfo);
        });
        
        return deviceList;
    }
    
    /**
     * Get a specific device
     * @param {string} id - Device identifier
     * @returns {object|null} - Device object or null if not found
     */
    getDevice(id) {
        return this.devices.has(id) ? this.devices.get(id) : null;
    }
    
    /**
     * Clean inactive devices
     * @param {number} maxInactiveTime - Max inactive time in milliseconds
     * @returns {number} - Number of devices cleaned
     */
    cleanInactiveDevices(maxInactiveTime = 30 * 60 * 1000) { // Default 30 minutes
        let count = 0;
        const now = new Date();
        
        this.devices.forEach((device, id) => {
            const inactiveTime = now - device.lastActive;
            
            if (inactiveTime > maxInactiveTime) {
                try {
                    device.ws.close();
                } catch (e) {
                    logger.debug(`Error closing WebSocket for device ${id}:`, e);
                }
                
                this.devices.delete(id);
                count++;
                logger.info(`Removed inactive device: ${id}`);
            }
        });
        
        return count;
    }
}

// Create singleton instance
const deviceManager = new DeviceManager();

module.exports = deviceManager;
