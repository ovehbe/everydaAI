const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define log level based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'info';
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Define the format for logs
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
);

// Define where logs should be stored
const transports = [
    // Console log
    new winston.transports.Console(),
    
    // Error log file
    new winston.transports.File({
        filename: path.join('logs', 'error.log'),
        level: 'error',
    }),
    
    // All logs file
    new winston.transports.File({ 
        filename: path.join('logs', 'all.log') 
    }),
];

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || level(),
    levels,
    format,
    transports,
});

module.exports = logger;
