const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { processWhatsAppMessage } = require('./ai');

// Define session path
const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || './whatsapp-session';

// Define WhatsApp group name
const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || 'everydAI';

// Make sure session directory exists
if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true });
}

class WhatsAppClient {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.assistantGroup = null;
        this.commandHandlers = new Map();
        
        // Register built-in commands
        this.registerCommand('help', this.handleHelpCommand);
        this.registerCommand('status', this.handleStatusCommand);
        this.registerCommand('ignore', this.handleIgnoreCommand);
    }
    
    /**
     * Initialize WhatsApp client
     */
    initialize() {
        logger.info('Initializing WhatsApp client');
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: SESSION_PATH
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            }
        });
        
        // Register event handlers
        this.client.on('qr', this.handleQRCode);
        this.client.on('ready', this.handleReady.bind(this));
        this.client.on('message', this.handleMessage.bind(this));
        this.client.on('disconnected', this.handleDisconnect.bind(this));
        
        // Initialize the client
        this.client.initialize().catch(err => {
            logger.error('Failed to initialize WhatsApp client:', err);
        });
    }
    
    /**
     * Handle QR code generation
     * @param {string} qr - QR code data
     */
    handleQRCode(qr) {
        logger.info('WhatsApp QR code received');
        
        // Generate QR code in terminal
        qrcode.generate(qr, { small: true });
        
        // Save QR code to file for remote access if needed
        const qrPath = path.join(SESSION_PATH, 'last-qr.txt');
        fs.writeFileSync(qrPath, qr);
        logger.info(`QR code saved to ${qrPath}`);
    }
    
    /**
     * Handle client ready event
     */
    async handleReady() {
        this.isReady = true;
        logger.info('WhatsApp client is ready');
        
        try {
            // Get or create assistant group
            await this.setupAssistantGroup();
            
            // Send startup message
            if (this.assistantGroup) {
                await this.client.sendMessage(
                    this.assistantGroup.id._serialized,
                    '🤖 *everydAI* is now online and ready to assist you!'
                );
            }
        } catch (error) {
            logger.error('Error in WhatsApp ready handler:', error);
        }
    }
    
    /**
     * Set up the assistant group
     */
    async setupAssistantGroup() {
        try {
            const chats = await this.client.getChats();
            
            // Look for existing group
            this.assistantGroup = chats.find(chat => 
                chat.isGroup && chat.name === GROUP_NAME
            );
            
            if (this.assistantGroup) {
                logger.info(`Found existing assistant group: ${GROUP_NAME}`);
            } else {
                logger.info(`Assistant group '${GROUP_NAME}' not found. Please create it manually.`);
                
                // Alternatively, we could create the group automatically:
                // const contacts = await this.client.getContacts();
                // const participantIds = [contacts[0].id._serialized]; // Add first contact
                // this.assistantGroup = await this.client.createGroup(GROUP_NAME, participantIds);
                
                // For now, we'll just notify the user to create the group manually
            }
        } catch (error) {
            logger.error('Failed to set up assistant group:', error);
        }
    }
    
    /**
     * Handle incoming messages
     * @param {Message} message - WhatsApp message object
     */
    async handleMessage(message) {
        try {
            // Skip messages sent by us
            if (message.fromMe) {
                return;
            }
            
            const chat = await message.getChat();
            
            // Process group messages
            if (chat.isGroup && chat.name === GROUP_NAME) {
                await this.processAssistantGroupMessage(message);
                return;
            }
            
            // Process direct messages
            // We can process these normally, or redirect to the assistant group
            await this.processDirectMessage(message);
            
        } catch (error) {
            logger.error('Error handling WhatsApp message:', error);
        }
    }
    
    /**
     * Process messages in the assistant group
     * @param {Message} message - WhatsApp message object
     */
    async processAssistantGroupMessage(message) {
        try {
            const messageText = message.body.trim();
            
            // Process commands (messages starting with !)
            if (messageText.startsWith('!')) {
                await this.processCommand(message);
                return;
            }
            
            // Process normal messages with AI
            const sender = await message.getContact();
            const senderName = sender.pushname || sender.number;
            
            logger.info(`Processing group message from ${senderName}: ${messageText.substring(0, 50)}...`);
            
            // Send "typing" indicator
            const chat = await message.getChat();
            chat.sendStateTyping();
            
            // Process the message with AI
            const response = await processWhatsAppMessage(messageText, {
                sender: senderName,
                isGroup: true,
                groupName: chat.name
            });
            
            // Send the AI response
            if (response) {
                await chat.sendMessage(response);
            }
            
        } catch (error) {
            logger.error('Error processing assistant group message:', error);
        }
    }
    
    /**
     * Process direct messages
     * @param {Message} message - WhatsApp message object
     */
    async processDirectMessage(message) {
        try {
            const chat = await message.getChat();
            const sender = await message.getContact();
            const senderName = sender.pushname || sender.number;
            
            logger.info(`Processing direct message from ${senderName}`);
            
            // Send typing indicator
            chat.sendStateTyping();
            
            // Process with AI
            const response = await processWhatsAppMessage(message.body, {
                sender: senderName,
                isGroup: false
            });
            
            // Send response
            if (response) {
                await chat.sendMessage(response);
            }
            
            // Optionally, forward message to assistant group if it exists
            if (this.assistantGroup) {
                await this.assistantGroup.sendMessage(`📱 *Message from ${senderName}*:\n${message.body}`);
            }
        } catch (error) {
            logger.error('Error processing direct message:', error);
        }
    }
    
    /**
     * Process command messages (starting with !)
     * @param {Message} message - WhatsApp message object
     */
    async processCommand(message) {
        try {
            const text = message.body.trim();
            const parts = text.substring(1).split(' '); // Remove ! and split
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);
            
            // Look for command handler
            if (this.commandHandlers.has(commandName)) {
                const handler = this.commandHandlers.get(commandName);
                await handler.call(this, message, args);
            } else {
                // Unknown command
                await message.reply(`Unknown command: !${commandName}\nType !help for available commands.`);
            }
        } catch (error) {
            logger.error('Error processing command:', error);
            await message.reply('Error processing command. Please try again.');
        }
    }
    
    /**
     * Register a command handler
     * @param {string} command - Command name
     * @param {Function} handler - Command handler function
     */
    registerCommand(command, handler) {
        this.commandHandlers.set(command.toLowerCase(), handler);
    }
    
    /**
     * Handle disconnection
     */
    handleDisconnect(reason) {
        this.isReady = false;
        logger.warn(`WhatsApp client disconnected: ${reason}`);
        
        // Attempt to reconnect
        setTimeout(() => {
            logger.info('Attempting to reconnect WhatsApp client');
            this.client.initialize().catch(err => {
                logger.error('Failed to reconnect WhatsApp client:', err);
            });
        }, 5000);
    }
    
    /**
     * Send message to WhatsApp
     * @param {string} to - Recipient (phone number with country code)
     * @param {string} message - Message text
     * @returns {Promise<boolean>} - Success status
     */
    async sendMessage(to, message) {
        if (!this.isReady) {
            logger.warn('WhatsApp client not ready');
            return false;
        }
        
        try {
            // Format number if needed
            const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
            
            // Send the message
            await this.client.sendMessage(chatId, message);
            return true;
        } catch (error) {
            logger.error('Failed to send WhatsApp message:', error);
            return false;
        }
    }
    
    /**
     * Send message to assistant group
     * @param {string} message - Message to send
     * @returns {Promise<boolean>} - Success status
     */
    async sendToGroup(message) {
        if (!this.isReady || !this.assistantGroup) {
            logger.warn('WhatsApp client not ready or group not found');
            return false;
        }
        
        try {
            await this.client.sendMessage(this.assistantGroup.id._serialized, message);
            return true;
        } catch (error) {
            logger.error('Failed to send message to assistant group:', error);
            return false;
        }
    }
    
    /**
     * Handle help command
     * @param {Message} message - Message object
     */
    async handleHelpCommand(message) {
        const commands = Array.from(this.commandHandlers.keys())
            .map(cmd => `!${cmd}`)
            .join(', ');
            
        const helpText = `
*everydAI Help*

Available commands:
${commands}

You can also ask me anything directly in this group or via direct message.
        `.trim();
        
        await message.reply(helpText);
    }
    
    /**
     * Handle status command
     * @param {Message} message - Message object
     */
    async handleStatusCommand(message) {
        const statusText = `
*everydAI Status*

WhatsApp: ${this.isReady ? '✅ Connected' : '❌ Disconnected'}
Assistant Group: ${this.assistantGroup ? '✅ Found' : '❌ Not found'}
Uptime: ${this.getUptime()}
        `.trim();
        
        await message.reply(statusText);
    }
    
    /**
     * Handle ignore command
     * @param {Message} message - Message object
     * @param {Array<string>} args - Command arguments
     */
    async handleIgnoreCommand(message, args) {
        if (args.length === 0) {
            await message.reply('Usage: !ignore <pattern>\nAdds a pattern to ignore in notifications/messages');
            return;
        }
        
        const pattern = args.join(' ');
        
        // Here we would add the pattern to a database or file
        // For now we'll just acknowledge
        await message.reply(`Added pattern to ignore: "${pattern}"`);
        
        // In a real implementation, we would save this to a database
        // and use it in AI filtering
    }
    
    /**
     * Calculate uptime string
     * @returns {string} - Formatted uptime
     */
    getUptime() {
        // This would track actual uptime, for now returning placeholder
        return 'Active';
    }
    
    /**
     * Clean shutdown
     */
    shutdown() {
        if (this.client) {
            logger.info('Shutting down WhatsApp client');
            this.client.destroy();
        }
    }
}

// Create singleton instance
const whatsappClient = new WhatsAppClient();

module.exports = whatsappClient;
