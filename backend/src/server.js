/**
 * ==================================================
 * HTTP SERVER AND SOCKET.IO INITIALIZATION
 * Production-Ready Server Startup with Real-Time Features
 * ==================================================
 * 
 * This module initializes:
 * 1. HTTP server with Express.js application
 * 2. Socket.io for real-time communications
 * 3. Database connections and migrations
 * 4. Graceful shutdown handling
 * 5. Environment-specific configurations
 */

require('dotenv').config();

const http = require('http');
const ExpressApp = require('./app');
const logger = require('./services/logger');
const db = require('./db/connection');

class Server {
  constructor() {
    this.expressApp = null;
    this.server = null;
    this.io = null;
    this.port = process.env.PORT || 4000;
  }

  /**
   * Initialize and start the server
   */
  async start() {
    try {
      logger.info('🚀 Starting GIS-NET Backend Server...');
      logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Port: ${this.port}`);

      // Initialize Express application
      this.expressApp = new ExpressApp();
      await this.expressApp.initializeDatabase();
      
      // Create HTTP server
      this.server = http.createServer(this.expressApp.getApp());

      // Configure Socket.io for real-time incident updates (Phase 3)
      const { configureSocketIO } = require('./services/socket');
      const authService = require('./services/auth');
      
      this.io = configureSocketIO(this.server, authService);
      
      // Inject Socket.io into the Express app
      this.expressApp.setSocketIO(this.io);
      
      // Make Socket.io available globally for incident broadcasting
      global.io = this.io;

      // Start server
      await this.listen();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('✅ GIS-NET Backend Server started successfully');
      logger.info('🔌 Socket.io real-time features enabled');
      this.logServerInfo();
      
    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Start HTTP server listening
   */
  async listen() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📴 Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Stop accepting new connections
        this.server.close(async () => {
          logger.info('🔒 HTTP server closed');
          
          // Close Socket.io connections
          if (this.io) {
            this.io.close();
            logger.info('🔌 Socket.io server closed');
          }
          
          // Close database connections
          await db.close();
          logger.info('🗄️  Database connections closed');
          
          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        });

        // Force close after timeout
        setTimeout(() => {
          logger.error('⚠️  Forceful shutdown due to timeout');
          process.exit(1);
        }, 10000);
        
      } catch (error) {
        logger.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
    process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker stop
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart
  }

  /**
   * Log server information
   */
  logServerInfo() {
    const env = process.env.NODE_ENV || 'development';
    const dbUrl = process.env.DATABASE_URL || 'not configured';
    
    logger.info('🌐 Server Information:');
    logger.info(`   📍 Port: ${this.port}`);
    logger.info(`   🔧 Environment: ${env}`);
    logger.info(`   🗄️  Database: ${dbUrl.replace(/:[^:@]*@/, ':***@')}`);
    logger.info(`   🔗 Health Check: http://localhost:${this.port}/api/health`);
    logger.info(`   📊 API Info: http://localhost:${this.port}/api`);
    
    if (env === 'development') {
      logger.info('🔧 Development Mode:');
      logger.info(`   🖥️  Frontend: http://localhost:3000`);
      logger.info(`   🔌 Socket.io Test: http://localhost:${this.port}/socket.io/`);
    }
  }

  /**
   * Get Socket.io instance for use in other modules
   */
  getSocketIO() {
    return this.io;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start();
}

module.exports = Server;
