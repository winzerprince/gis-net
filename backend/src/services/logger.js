/**
 * ==================================================
 * WINSTON LOGGER CONFIGURATION
 * Structured Logging with Multiple Transports
 * ==================================================
 * 
 * Professional logging setup with:
 * - Console output with colors for development
 * - File rotation for production logs
 * - Error-specific logging
 * - JSON structured format
 * - Performance and security considerations
 */

const winston = require('winston');
const path = require('path');

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for console output (development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  ),
);

// Custom format for file output (production)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Define transports based on environment
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  })
);

// File transports (production and development)
if (process.env.NODE_ENV !== 'test') {
  // General log file
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
      format: fileFormat,
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Error-specific log file
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      format: fileFormat,
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels: logLevels,
  format: fileFormat,
  defaultMeta: { 
    service: 'gis-net-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
});

// Create logs directory if it doesn't exist (for file transports)
if (process.env.NODE_ENV !== 'test') {
  const fs = require('fs');
  const logsDir = 'logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
}

// Helper methods for structured logging
logger.logRequest = (req, res, responseTime) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });
};

logger.logError = (error, req = null, additionalData = {}) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    ...additionalData
  };

  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userId: req.user?.id,
    };
  }

  logger.error('Application Error', errorLog);
};

logger.logSecurity = (event, details, req = null) => {
  const securityLog = {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  };

  if (req) {
    securityLog.request = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
    };
  }

  logger.warn('Security Event', securityLog);
};

logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata,
  });
};

logger.logDatabase = (operation, query, duration, rows = 0) => {
  logger.debug('Database Operation', {
    operation,
    query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
    duration: `${duration}ms`,
    rowsAffected: rows,
  });
};

module.exports = logger;
