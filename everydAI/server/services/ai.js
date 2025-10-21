const { OpenAI } = require('openai');
const axios = require('axios');
const logger = require('../utils/logger');
const whatsappClient = require('./whatsapp');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI Service Class
 */
class AIService {
    constructor() {
        this.rules = new Map();
        this.dynamicRules = new Map();
        this.loadRules();
    }
    
    /**
     * Load filtering rules from config
     */
    loadRules() {
        try {
            const rulesPath = path.join(__dirname, '../config/rules.json');
            
            if (fs.existsSync(rulesPath)) {
                const rulesData = fs.readFileSync(rulesPath, 'utf8');
                const rules = JSON.parse(rulesData);
                
                for (const [type, rulesList] of Object.entries(rules)) {
                    this.rules.set(type, rulesList);
                }
                
                logger.info(`Loaded ${this.rules.size} rule types`);
            } else {
                logger.info('No rules config found, using defaults');
                
                // Set default rules
                this.rules.set('spam_keywords', ['spam', 'offer', 'limited time', 'discount']);
                this.rules.set('notification_ignore', ['battery', 'backup', 'update available']);
            }
        } catch (error) {
            logger.error('Error loading rules:', error);
        }
    }
    
    /**
     * Save rules to config
     */
    saveRules() {
        try {
            const rulesObj = {};
            
            for (const [type, rulesList] of this.rules.entries()) {
                rulesObj[type] = rulesList;
            }
            
            for (const [type, rulesList] of this.dynamicRules.entries()) {
                if (!rulesObj[type]) {
                    rulesObj[type] = [];
                }
                rulesObj[type] = [...rulesObj[type], ...rulesList];
            }
            
            const rulesPath = path.join(__dirname, '../config/rules.json');
            
            // Create directory if it doesn't exist
            const configDir = path.dirname(rulesPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            fs.writeFileSync(rulesPath, JSON.stringify(rulesObj, null, 2), 'utf8');
            logger.info('Rules saved to config');
        } catch (error) {
            logger.error('Error saving rules:', error);
        }
    }
    
    /**
     * Add dynamic rule
     * @param {string} type - Rule type
     * @param {string} rule - Rule to add
     */
    addDynamicRule(type, rule) {
        if (!this.dynamicRules.has(type)) {
            this.dynamicRules.set(type, []);
        }
        
        this.dynamicRules.get(type).push(rule);
        logger.info(`Added dynamic rule to ${type}: ${rule}`);
        
        // Save rules
        this.saveRules();
    }
    
    /**
     * Filter content using AI
     * @param {string} content - Content to filter
     * @param {string} type - Content type (notification, sms, whatsapp, call)
     * @param {object} metadata - Additional metadata
     * @returns {Promise<object>} - Filter result
     */
    async filterContent(content, type, metadata = {}) {
        try {
            // Check if content matches any static or dynamic rules
            const matched = this.checkRuleMatch(content, type);
            
            if (matched.isMatch) {
                return {
                    important: false,
                    score: 0.1,
                    reason: `Matched rule: ${matched.rule}`,
                    filter: true
                };
            }
            
            // Use simple AI for initial filtering (OpenAI)
            const filterResult = await this.filterWithOpenAI(content, type, metadata);
            
            // Return filter result
            return filterResult;
        } catch (error) {
            logger.error(`Error filtering ${type} content:`, error);
            
            // Default to important in case of error
            return {
                important: true,
                score: 0.8,
                reason: 'Error in filtering, defaulting to important',
                filter: false
            };
        }
    }
    
    /**
     * Check if content matches any rules
     * @param {string} content - Content to check
     * @param {string} type - Content type
     * @returns {object} - Match result
     */
    checkRuleMatch(content, type) {
        // Convert content to lowercase for case-insensitive matching
        const lowerContent = content.toLowerCase();
        
        // Check static rules
        const staticRules = this.rules.get(`${type}_ignore`) || [];
        for (const rule of staticRules) {
            if (lowerContent.includes(rule.toLowerCase())) {
                return { isMatch: true, rule };
            }
        }
        
        // Check dynamic rules
        const dynamicRules = this.dynamicRules.get(`${type}_ignore`) || [];
        for (const rule of dynamicRules) {
            if (lowerContent.includes(rule.toLowerCase())) {
                return { isMatch: true, rule };
            }
        }
        
        // Check spam keywords
        const spamKeywords = this.rules.get('spam_keywords') || [];
        let spamScore = 0;
        let matchedKeyword = null;
        
        for (const keyword of spamKeywords) {
            if (lowerContent.includes(keyword.toLowerCase())) {
                spamScore += 1;
                if (!matchedKeyword) {
                    matchedKeyword = keyword;
                }
            }
        }
        
        // If multiple spam keywords are found, consider it spam
        if (spamScore >= 2) {
            return { isMatch: true, rule: `Multiple spam keywords (${spamScore})` };
        }
        
        return { isMatch: false };
    }
    
    /**
     * Filter content using OpenAI (cheap AI)
     * @param {string} content - Content to filter
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @returns {Promise<object>} - Filter result
     */
    async filterWithOpenAI(content, type, metadata) {
        try {
            // Create a prompt for content filtering
            const prompt = this.createFilterPrompt(content, type, metadata);
            
            // Call OpenAI API
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an AI assistant that evaluates the importance of messages and notifications. Score on a scale of 0.0 to 1.0, where 0.0 is completely unimportant (spam, automated message, etc) and 1.0 is extremely important (emergency, time-sensitive, etc). Respond with a JSON object containing importance score, whether to filter it out, and a brief reason."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 150,
                response_format: { type: "json_object" }
            });
            
            // Extract the filter result
            const result = JSON.parse(completion.choices[0].message.content);
            
            // Validate and normalize the result
            return {
                important: typeof result.important === 'boolean' ? result.important : (result.score > 0.5),
                score: typeof result.score === 'number' ? result.score : 0.5,
                reason: result.reason || 'No reason provided',
                filter: typeof result.filter === 'boolean' ? result.filter : (result.score < 0.3),
                suggestedRule: result.suggestedRule
            };
        } catch (error) {
            logger.error('Error using OpenAI for filtering:', error);
            
            // Default to important in case of error
            return {
                important: true,
                score: 0.7,
                reason: 'Error in OpenAI filtering, defaulting to important',
                filter: false
            };
        }
    }
    
    /**
     * Create a prompt for content filtering
     * @param {string} content - Content to filter
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @returns {string} - Prompt text
     */
    createFilterPrompt(content, type, metadata) {
        const typeDescription = {
            notification: 'mobile notification',
            sms: 'text message',
            whatsapp: 'WhatsApp message',
            call: 'phone call'
        }[type] || type;
        
        let prompt = `Evaluate the importance of this ${typeDescription}:\n\n${content}\n\n`;
        
        // Add metadata for context
        if (metadata.sender) {
            prompt += `From: ${metadata.sender}\n`;
        }
        
        if (metadata.app) {
            prompt += `App: ${metadata.app}\n`;
        }
        
        prompt += `\nRate the importance on a scale from 0.0 to 1.0, where 0.0 is completely unimportant (spam, promotional, etc.) and 1.0 is extremely important (emergency, time-sensitive, etc.).`;
        prompt += `\n\nIf this appears to be spam, promotional, or routine notification, suggest a filtering rule that could identify similar content in the future.`;
        prompt += `\n\nRespond with a JSON object with these fields: { "important": boolean, "score": number, "reason": string, "filter": boolean, "suggestedRule": string or null }`;
        
        return prompt;
    }
    
    /**
     * Process content with full AI (xAI Grok)
     * @param {string} content - Content to process
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @returns {Promise<string>} - AI response
     */
    async processWithGrok(content, type, metadata = {}) {
        try {
            // Check if xAI API is configured
            if (!process.env.XAI_GROK_API_KEY) {
                logger.warn('xAI Grok API not configured, falling back to OpenAI');
                return this.processWithOpenAI(content, type, metadata, true);
            }
            
            // Create a prompt for xAI Grok
            const prompt = this.createGrokPrompt(content, type, metadata);
            
            // Call xAI Grok API
            const response = await axios.post(
                process.env.XAI_GROK_API_URL || 'https://x.ai/api',
                {
                    model: 'grok-1',
                    prompt: prompt,
                    temperature: 0.7,
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.XAI_GROK_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // Extract and return the response
            return response.data.choices[0].text;
        } catch (error) {
            logger.error('Error using xAI Grok API:', error);
            
            // Fall back to OpenAI
            logger.info('Falling back to OpenAI for processing');
            return this.processWithOpenAI(content, type, metadata, true);
        }
    }
    
    /**
     * Process content with OpenAI (as fallback or primary)
     * @param {string} content - Content to process
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @param {boolean} fullProcessing - Whether this is full processing or filtering
     * @returns {Promise<string>} - AI response
     */
    async processWithOpenAI(content, type, metadata, fullProcessing = false) {
        try {
            // Create appropriate prompt
            const prompt = fullProcessing 
                ? this.createFullPrompt(content, type, metadata)
                : this.createFilterPrompt(content, type, metadata);
            
            // Select appropriate model and parameters
            const model = fullProcessing ? "gpt-4" : "gpt-3.5-turbo";
            const maxTokens = fullProcessing ? 500 : 150;
            
            // Call OpenAI API
            const completion = await openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: fullProcessing
                            ? "You are an AI assistant that helps process and respond to messages, calls, and notifications. Provide clear, concise, and helpful responses."
                            : "You are an AI assistant that evaluates the importance of messages and notifications."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: maxTokens
            });
            
            // Return the response
            return completion.choices[0].message.content;
        } catch (error) {
            logger.error('Error using OpenAI:', error);
            return 'Error processing content. Please try again later.';
        }
    }
    
    /**
     * Create prompt for full processing
     * @param {string} content - Content to process
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @returns {string} - Prompt text
     */
    createFullPrompt(content, type, metadata) {
        const typeDescription = {
            notification: 'mobile notification',
            sms: 'text message',
            whatsapp: 'WhatsApp message',
            call: 'phone call transcription'
        }[type] || type;
        
        let prompt = `Process this ${typeDescription} and provide a helpful response:\n\n${content}\n\n`;
        
        // Add metadata for context
        if (metadata.sender) {
            prompt += `From: ${metadata.sender}\n`;
        }
        
        if (metadata.app) {
            prompt += `App: ${metadata.app}\n`;
        }
        
        // Add task-specific instructions
        switch (type) {
            case 'sms':
                prompt += `\nIf this appears to be a verification code, extract it. If it's a question, craft a response. If it's informational, summarize the key points.`;
                break;
                
            case 'whatsapp':
                prompt += `\nRespond as an AI assistant that's monitoring WhatsApp. If asked a question, provide an answer. If it's a request, acknowledge it. If it contains instructions for changing your behavior, confirm understanding.`;
                break;
                
            case 'call':
                prompt += `\nSummarize the key points of this conversation. Extract any action items, important dates, or contact information.`;
                break;
                
            case 'notification':
                prompt += `\nDetermine if this notification requires attention. If so, explain what action should be taken.`;
                break;
        }
        
        return prompt;
    }
    
    /**
     * Create prompt for xAI Grok
     * @param {string} content - Content to process
     * @param {string} type - Content type
     * @param {object} metadata - Additional metadata
     * @returns {string} - Prompt text
     */
    createGrokPrompt(content, type, metadata) {
        // For xAI Grok, we'll use a similar prompt to the OpenAI full prompt
        return this.createFullPrompt(content, type, metadata);
    }
}

// Create singleton instance
const aiService = new AIService();

/**
 * Process notification content
 * @param {object} notification - Notification data
 * @returns {Promise<object>} - Processing result
 */
async function processNotification(notification) {
    try {
        // Extract notification content
        const { title, text, packageName, appName } = notification;
        const content = `${title}\n${text}`;
        
        // First filter with cheap AI
        const filterResult = await aiService.filterContent(content, 'notification', { 
            app: appName || packageName 
        });
        
        // If not important, don't process further
        if (filterResult.filter) {
            logger.info(`Filtered notification: ${filterResult.reason}`);
            
            // If we got a suggested rule, consider adding it
            if (filterResult.suggestedRule) {
                aiService.addDynamicRule('notification_ignore', filterResult.suggestedRule);
            }
            
            return {
                processed: false,
                filtered: true,
                reason: filterResult.reason,
                score: filterResult.score
            };
        }
        
        // If important enough, process with full AI
        if (filterResult.important || filterResult.score > 0.7) {
            logger.info(`Processing important notification (score: ${filterResult.score})`);
            
            // Process with full AI
            const response = await aiService.processWithGrok(content, 'notification', {
                app: appName || packageName
            });
            
            // Notify via WhatsApp if configured
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                await whatsappClient.sendToGroup(
                    `📱 *Notification from ${appName || packageName}*\n` +
                    `${title}\n` +
                    `${text}\n\n` +
                    `*AI Analysis:*\n${response}`
                );
            }
            
            return {
                processed: true,
                response,
                score: filterResult.score
            };
        } else {
            // Moderately important notification
            logger.info(`Notification of moderate importance (score: ${filterResult.score}), summarizing`);
            
            // Get brief summary from OpenAI
            const summary = await aiService.processWithOpenAI(
                content,
                'notification', 
                { app: appName || packageName },
                false
            );
            
            return {
                processed: true,
                summary,
                score: filterResult.score
            };
        }
    } catch (error) {
        logger.error('Error processing notification:', error);
        return {
            processed: false,
            error: 'Failed to process notification'
        };
    }
}

/**
 * Process SMS content
 * @param {object} sms - SMS data
 * @returns {Promise<object>} - Processing result
 */
async function processSMS(sms) {
    try {
        // Extract SMS content
        const { messageBody, phoneNumber } = sms;
        
        // First filter with cheap AI
        const filterResult = await aiService.filterContent(messageBody, 'sms', { 
            sender: phoneNumber 
        });
        
        // If not important, don't process further
        if (filterResult.filter) {
            logger.info(`Filtered SMS: ${filterResult.reason}`);
            
            // If we got a suggested rule, consider adding it
            if (filterResult.suggestedRule) {
                aiService.addDynamicRule('sms_ignore', filterResult.suggestedRule);
            }
            
            return {
                processed: false,
                filtered: true,
                reason: filterResult.reason,
                score: filterResult.score
            };
        }
        
        // If important enough, process with full AI
        if (filterResult.important || filterResult.score > 0.6) {
            logger.info(`Processing important SMS (score: ${filterResult.score})`);
            
            // Process with full AI
            const response = await aiService.processWithGrok(messageBody, 'sms', {
                sender: phoneNumber
            });
            
            // Notify via WhatsApp if configured
            if (whatsappClient.isReady && whatsappClient.assistantGroup) {
                await whatsappClient.sendToGroup(
                    `💬 *SMS from ${phoneNumber}*\n` +
                    `${messageBody}\n\n` +
                    `*AI Analysis:*\n${response}`
                );
            }
            
            return {
                processed: true,
                response,
                score: filterResult.score
            };
        } else {
            // Moderately important SMS
            logger.info(`SMS of moderate importance (score: ${filterResult.score})`);
            
            // Get brief summary
            const summary = await aiService.processWithOpenAI(
                messageBody, 
                'sms',
                { sender: phoneNumber },
                false
            );
            
            return {
                processed: true,
                summary,
                score: filterResult.score
            };
        }
    } catch (error) {
        logger.error('Error processing SMS:', error);
        return {
            processed: false,
            error: 'Failed to process SMS'
        };
    }
}

/**
 * Process WhatsApp message
 * @param {string} messageText - Message text
 * @param {object} metadata - Message metadata
 * @returns {Promise<string>} - Response text
 */
async function processWhatsAppMessage(messageText, metadata = {}) {
    try {
        // WhatsApp messages are typically already important since they're direct communication
        // Process with full AI
        return await aiService.processWithGrok(messageText, 'whatsapp', metadata);
    } catch (error) {
        logger.error('Error processing WhatsApp message:', error);
        return 'Sorry, I encountered an error while processing your message. Please try again later.';
    }
}

/**
 * Process speech/call audio
 * @param {string} transcript - Call transcript
 * @param {object} metadata - Call metadata
 * @returns {Promise<string>} - Response text
 */
async function processSpeech(transcript, metadata = {}) {
    try {
        // Process with full AI
        return await aiService.processWithGrok(transcript, 'call', metadata);
    } catch (error) {
        logger.error('Error processing speech:', error);
        return 'I\'m sorry, I couldn\'t process that. Could you please repeat?';
    }
}

module.exports = {
    aiService,
    processNotification,
    processSMS,
    processWhatsAppMessage,
    processSpeech
};
