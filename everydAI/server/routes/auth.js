const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Simple in-memory user store
// In production, this should use a database
let users = [];

// Try to load users from file
const usersPath = path.join(__dirname, '../config/users.json');
try {
    if (fs.existsSync(usersPath)) {
        users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        logger.info(`Loaded ${users.length} users from config`);
    }
} catch (error) {
    logger.error('Failed to load users from config:', error);
}

/**
 * Save users to file
 */
function saveUsers() {
    try {
        const configDir = path.dirname(usersPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        logger.error('Failed to save users to config:', error);
    }
}

/**
 * Register a new user
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password, apiKey } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        // Check if username is taken
        if (users.some(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Check API key if required
        if (process.env.REQUIRE_API_KEY && process.env.API_KEY !== apiKey) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const newUser = {
            id: uuidv4(),
            username,
            password: hashedPassword,
            created: new Date().toISOString()
        };
        
        // Add to users array
        users.push(newUser);
        saveUsers();
        
        // Generate token
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        res.status(201).json({
            message: 'User registered successfully',
            user: { id: newUser.id, username: newUser.username },
            token
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * Login
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        // Find user
        const user = users.find(u => u.username === username);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        res.status(200).json({
            message: 'Login successful',
            user: { id: user.id, username: user.username },
            token
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * Get current user
 */
router.get('/me', (req, res) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }
        
        // Check header format
        const parts = authHeader.split(' ');
        
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid authorization format' });
        }
        
        const token = parts[1];
        
        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ error: 'Invalid token' });
            }
            
            // Find user
            const user = users.find(u => u.id === decoded.id);
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Return user info
            res.status(200).json({
                user: { id: user.id, username: user.username }
            });
        });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

module.exports = router;
