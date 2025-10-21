const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Validates JWT token in the Authorization header
 */
const authMiddleware = (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }
        
        // Check if header has the right format
        const parts = authHeader.split(' ');
        
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid authorization format' });
        }
        
        const token = parts[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                logger.warn(`Invalid token: ${err.message}`);
                return res.status(401).json({ error: 'Invalid token' });
            }
            
            // Add user info to request
            req.user = decoded;
            next();
        });
    } catch (error) {
        logger.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error' });
    }
};

/**
 * WebSocket authentication middleware
 * Validates JWT token in the query string or headers
 */
const wsAuthMiddleware = (req, socket, next) => {
    try {
        // Get token from query or headers
        const token = req.url.includes('token=') 
            ? new URL(req.url, 'http://localhost').searchParams.get('token')
            : req.headers['sec-websocket-protocol'];
        
        if (!token) {
            logger.warn('WebSocket connection attempt without token');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                logger.warn(`Invalid WebSocket token: ${err.message}`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            
            // Add user info to request
            req.user = decoded;
            next();
        });
    } catch (error) {
        logger.error('WebSocket auth middleware error:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
    }
};

module.exports = authMiddleware;
module.exports.wsAuthMiddleware = wsAuthMiddleware;
