/**
 * ==================================================
 * EXPRESS APPLICATION CONFIGURATION
 * Professional-Grade API Server Setup
 * ==================================================
 * 
 * This module configures the Express.js application with:
 * - Security middleware (Helmet, CORS, Rate limiting)
 * - Request parsing and compression
 * - Structured error handling
 * - Health check endpoints
 * - API documentation endpoints
 * - Performance monitoring
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('express-async-errors');

const logger = require('./services/logger');
const db = require('./db/connection');
const migrationManager = require('./db/migrate');
const { authenticateToken } = require('./middlewares/auth');

// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const incidentRoutes = require('./routes/incidents'); // Phase 3 - Incident Management
const analysisRoutes = require('./routes/analysis'); // Phase 4 - Advanced GIS Analytics
// const healthRoutes = require('./routes/health'); // Will be created in Phase 4

class ExpressApp {
  constructor(options = {}) {
    this.app = express();
    this.io = null; // To hold Socket.io instance
    this.isTestMode = options.isTestMode || process.env.NODE_ENV === 'test';
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Injects the Socket.IO instance into the relevant parts of the application.
   * @param {object} io - The Socket.IO server instance.
   */
  setSocketIO(io) {
    this.io = io;
    // Inject the io instance into the incident routes module
    if (incidentRoutes.setSocketIO) {
      incidentRoutes.setSocketIO(io);
      logger.info('🔌 Socket.io instance injected into incident routes');
    }
  }

  /**
   * Configure Express middleware stack
   */
  setupMiddleware() {
    // Trust proxy for accurate client IP (important for rate limiting)
    this.app.set('trust proxy', process.env.TRUST_PROXY || 1);

    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
          scriptSrc: ["'self'", "https://unpkg.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: [
            "'self'",
            "http://localhost:4000",
            "http://127.0.0.1:4000",
            "ws://localhost:4000",
            "ws://127.0.0.1:4000",
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding maps
    }));

    // CORS configuration
    const corsOptions = {
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          process.env.CORS_ORIGIN || 'http://localhost:3000',
          'http://localhost:3000',
          'http://localhost:3001', // Alternative frontend port
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
        ];
        
        // In development, allow any localhost origin
  if (process.env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    };

    this.app.use(cors(corsOptions));

    // Body parsing and compression
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      // Log request
      logger.http(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const responseTime = Date.now() - start;
        logger.logRequest(req, res, responseTime);
        originalEnd.call(this, chunk, encoding);
      };

      next();
    });

    // Rate limiting (skip in test mode)
    if (!this.isTestMode) {
      this.setupRateLimiting();
    }

    logger.info('🛡️  Express middleware configured');
  }

  /**
   * Configure rate limiting for different endpoints
   */
  setupRateLimiting() {
    // General API rate limit
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Requests per window
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip + ':' + (req.user?.id || 'anonymous');
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.startsWith('/api/health');
      },
      onLimitReached: (req, res, options) => {
        logger.logSecurity('rate_limit_exceeded', {
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent'),
          userId: req.user?.id,
        }, req);
      },
    });

    // Stricter rate limit for authentication endpoints
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Only 10 attempts per window
      message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful requests
    });

    // Very strict rate limit for incident creation
    const incidentCreationLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 5, // Only 5 incidents per minute per user
      message: {
        error: 'Too many incident reports, please wait before submitting another.',
        retryAfter: '1 minute'
      },
      keyGenerator: (req) => {
        return req.user?.id || req.ip;
      },
    });

    // Apply rate limiters
    this.app.use('/api/', generalLimiter);
    this.app.use('/api/auth/', authLimiter);
    this.app.use('/api/incidents', (req, res, next) => {
      if (req.method === 'POST') {
        incidentCreationLimiter(req, res, next);
      } else {
        next();
      }
    });

    logger.info('🚦 Rate limiting configured');
  }

  /**
   * Configure application routes
   */
  setupRoutes() {
    // Health check endpoint (always available)
    this.app.get('/api/health', async (req, res) => {
      try {
        const dbHealth = await db.healthCheck();
        const migrationStatus = await migrationManager.getStatus();
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          database: dbHealth,
          migrations: migrationStatus,
        };

        res.json(health);
      } catch (error) {
        logger.logError(error, req, { endpoint: 'health_check' });
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'GIS-NET Backend API',
        description: 'Real-Time Traffic Incident Reporting and Analysis System',
        version: process.env.npm_package_version || '1.0.0',
        documentation: '/api/docs',
        health: '/api/health',
        endpoints: {
          auth: '/api/auth',
          incidents: '/api/incidents', 
          analysis: '/api/analysis',
        },
        features: [
          'Real-time incident reporting',
          'Spatial data analysis with PostGIS',
          'Interactive mapping with clustering',
          'Community validation system',
          'RESTful API with Socket.io',
        ],
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'GIS-NET Backend API Server',
        status: 'running',
        api: '/api',
        health: '/api/health',
      });
    });

    // Authentication and user management routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/users', authenticateToken, userRoutes);
    
    // Incident management routes (Phase 3)
    this.app.use('/api/incidents', incidentRoutes.router);
    
    // Advanced GIS analysis routes (Phase 4)
    this.app.use('/api/analysis', analysisRoutes);

    // 404 handler for unknown routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: {
          health: 'GET /api/health',
          info: 'GET /api',
        },
      });
    });

    logger.info('🛣️  Routes configured');
  }

  /**
   * Configure error handling middleware
   */
  setupErrorHandling() {
    // Global error handler (must be last middleware)
    this.app.use((error, req, res, next) => {
      // Log the error
      logger.logError(error, req, {
        stack: error.stack,
        body: req.body,
        params: req.params,
        query: req.query,
      });

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';

      // Default error response
      let statusCode = error.statusCode || error.status || 500;
      let message = error.message || 'Internal Server Error';

      // Handle specific error types
      if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
      } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
      } else if (error.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid data format';
      } else if (error.code === '23505') { // PostgreSQL unique violation
        statusCode = 409;
        message = 'Resource already exists';
      } else if (error.code === '23503') { // PostgreSQL foreign key violation
        statusCode = 400;
        message = 'Invalid reference';
      }

      // Error response structure
      const errorResponse = {
        error: {
          message,
          status: statusCode,
          ...(isDevelopment && {
            stack: error.stack,
            details: error.details,
          }),
        },
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method,
      };

      res.status(statusCode).json(errorResponse);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    logger.info('🛡️  Error handling configured');
  }

  /**
   * Get the configured Express app instance
   */
  getApp() {
    return this.app;
  }

  /**
   * Initialize database and migrations
   */
  async initializeDatabase() {
    try {
      logger.info('🔄 Initializing database connection...');
      await migrationManager.initialize();
      await migrationManager.runMigrations();
      await migrationManager.verifySchema();
      logger.info('✅ Database initialization completed');
    } catch (error) {
      logger.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }
}

module.exports = ExpressApp;
