require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// Import modules
const logger = require('./utils/logger');
const authMiddleware = require('./middleware/auth');
const whatsappClient = require('./services/whatsapp');
const callService = require('./services/twilio'); // Now a CallService
const aiService = require('./services/ai');
const { handleNotification, handleSMS, handleCall } = require('./handlers');
const deviceManager = require('./services/deviceManager');

// Create express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });

// Initialize services
whatsappClient.initialize();

// WebSocket connection handler
wss.on('connection', async (ws, req) => {
    // Generate a unique ID for this connection
    const connectionId = uuidv4();
    
    logger.info(`New WebSocket connection: ${connectionId}`);
    
    // Add connection to device manager
    const device = deviceManager.registerDevice(connectionId, ws);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'info',
        message: 'Connected to everydAI server',
        connectionId
    }));
    
    // Handle incoming messages
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            logger.info(`Received message from ${connectionId}: ${data.type}`);
            
            // Update device data
            if (data.type === 'init') {
                deviceManager.updateDeviceInfo(connectionId, data);
                return;
            }
            
            // Process different event types
            switch (data.type) {
                case 'notification':
                    await handleNotification(data, device);
                    break;
                case 'sms':
                    await handleSMS(data, device);
                    break;
                case 'call':
                    await handleCall(data, device);
                    break;
                case 'call_audio':
                    // Process call audio stream
                    await callService.processCallAudio(data.callId, data.audio);
                    break;
                case 'call_register':
                    // Register new call
                    callService.registerCall(data.callId, data.phoneNumber, connectionId, data.isIncoming);
                    break;
                case 'call_status':
                    // Update call status
                    callService.updateCallStatus(data.callId, data.status);
                    break;
                case 'call_observe':
                    // Client wants to observe a call
                    callService.addCallObserver(data.callId, connectionId);
                    break;
                case 'command':
                    // Handle commands from the client
                    break;
                default:
                    logger.warn(`Unknown message type: ${data.type}`);
            }
        } catch (error) {
            logger.error('Error processing WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message'
            }));
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        logger.info(`WebSocket connection closed: ${connectionId}`);
        deviceManager.unregisterDevice(connectionId);
    });
    
    // Handle errors
    ws.on('error', (error) => {
        logger.error(`WebSocket error for ${connectionId}:`, error);
    });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', authMiddleware, require('./routes/events'));
app.use('/api/whatsapp', authMiddleware, require('./routes/whatsapp'));
app.use('/api/calls', authMiddleware, require('./routes/calls'));
app.use('/api/ai', authMiddleware, require('./routes/ai'));

// Default route
app.get('/', (req, res) => {
    res.send('everydAI API Server');
});

// Start the server
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

// Handle process termination
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        logger.info('Server closed');
        whatsappClient.shutdown();
        process.exit(0);
    });
});

module.exports = { app, server };
