const express = require('express');
const router = express.Router();
const { aiService } = require('../services/ai');
const logger = require('../utils/logger');

/**
 * Process content with AI
 */
router.post('/process', async (req, res) => {
    try {
        const { content, type, metadata } = req.body;
        
        // Validate input
        if (!content || !type) {
            return res.status(400).json({ error: 'Content and type are required' });
        }
        
        // Process with full AI
        const result = await aiService.processWithGrok(content, type, metadata || {});
        
        res.status(200).json({
            success: true,
            result
        });
    } catch (error) {
        logger.error('Error processing with AI:', error);
        res.status(500).json({ error: 'Failed to process content' });
    }
});

/**
 * Filter content with AI
 */
router.post('/filter', async (req, res) => {
    try {
        const { content, type, metadata } = req.body;
        
        // Validate input
        if (!content || !type) {
            return res.status(400).json({ error: 'Content and type are required' });
        }
        
        // Filter with cheap AI
        const result = await aiService.filterContent(content, type, metadata || {});
        
        res.status(200).json({
            success: true,
            result
        });
    } catch (error) {
        logger.error('Error filtering with AI:', error);
        res.status(500).json({ error: 'Failed to filter content' });
    }
});

/**
 * Add a filtering rule
 */
router.post('/rules', (req, res) => {
    try {
        const { type, rule } = req.body;
        
        // Validate input
        if (!type || !rule) {
            return res.status(400).json({ error: 'Type and rule are required' });
        }
        
        // Add rule
        aiService.addDynamicRule(type, rule);
        
        res.status(201).json({
            success: true,
            message: `Rule added to ${type}`
        });
    } catch (error) {
        logger.error('Error adding rule:', error);
        res.status(500).json({ error: 'Failed to add rule' });
    }
});

/**
 * Get all rules
 */
router.get('/rules', (req, res) => {
    try {
        const rules = {};
        
        // Get static rules
        for (const [type, rulesList] of aiService.rules.entries()) {
            rules[type] = rulesList;
        }
        
        // Get dynamic rules
        for (const [type, rulesList] of aiService.dynamicRules.entries()) {
            if (!rules[type]) {
                rules[type] = [];
            }
            rules[type] = [...rules[type], ...rulesList];
        }
        
        res.status(200).json(rules);
    } catch (error) {
        logger.error('Error getting rules:', error);
        res.status(500).json({ error: 'Failed to get rules' });
    }
});

module.exports = router;
