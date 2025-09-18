/**
 * ==================================================
 * GIS-NET SERVER ENTRY POINT
 * Real-Time Traffic Incident Reporting System
 * ==================================================
 * 
 * Main server file that orchestrates:
 * - Express application initialization
 * - Socket.io real-time communication
 * - Database connection management
 * - Graceful shutdown handling
 * - Environment configuration
 */

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const ExpressApp = require('./app');
const logger = require('./services/logger');
const db = require('./db/connection');

class GISNetServer {
  constructor() {
    this.port = process.env.PORT || 4000;
    this.server = null;
    this.io = null;
    this.expressApp = new ExpressApp();
  }

  /**
   * Initialize and start the server
   */
  async start() {
    try {
      logger.info('🚀 Starting GIS-NET Server...');
      
      // Initialize database first
      await this.expressApp.initializeDatabase();
      
      // Create HTTP server
      this.server = http.createServer(this.expressApp.getApp());
      
      // Setup Socket.io
      this.setupSocketIO();
      
      // Start listening
      await this.listen();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      logger.info('🎉 GIS-NET Server started successfully!');
      this.logServerInfo();
      
    } catch (error) {
      logger.error('💥 Server startup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Configure Socket.io for real-time communication
   */
  setupSocketIO() {
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      
      // Connection settings
      pingTimeout: 60000,
      pingInterval: 25000,
      
      // Transport settings
      transports: ['websocket', 'polling'],
      
      // Adapter configuration for scaling (can be Redis in production)
      adapter: undefined, // Will use memory adapter by default
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      const clientIP = socket.handshake.address;
      
      logger.info(`🔌 Client connected: ${clientId} from ${clientIP}`);

      // Handle authentication
      socket.on('authenticate', (data) => {
        try {
          // Authentication logic will be implemented in auth phase
          socket.userId = data.userId;
          socket.join('authenticated');
          
          socket.emit('authenticated', {
            success: true,
            message: 'Successfully authenticated',
          });
          
          logger.info(`🔐 Client authenticated: ${clientId} (User: ${data.userId})`);
        } catch (error) {
          socket.emit('auth_error', {
            success: false,
            message: 'Authentication failed',
          });
        }
      });

      // Handle incident subscriptions
      socket.on('subscribe_incidents', (data) => {
        try {
          const { bounds, types } = data;
          
          // Join room for specific geographic area
          const roomName = `incidents_${bounds.north}_${bounds.south}_${bounds.east}_${bounds.west}`;
          socket.join(roomName);
          
          socket.emit('subscribed', {
            success: true,
            room: roomName,
            message: 'Subscribed to incident updates',
          });
          
          logger.debug(`📍 Client subscribed to incidents: ${clientId} (Room: ${roomName})`);
        } catch (error) {
          socket.emit('subscription_error', {
            success: false,
            message: 'Failed to subscribe to incidents',
          });
        }
      });

      // Handle incident reporting via Socket.io
      socket.on('report_incident', (data) => {
        try {
          // Validate user is authenticated
          if (!socket.userId) {
            socket.emit('incident_error', {
              success: false,
              message: 'Authentication required',
            });
            return;
          }

          // Add reporter information
          data.reportedBy = socket.userId;
          
          // Broadcast to relevant geographic area (will implement in incident service)
          this.broadcastNewIncident(data);
          
          logger.info(`📋 Incident reported via Socket.io: ${clientId} (User: ${socket.userId})`);
        } catch (error) {
          socket.emit('incident_error', {
            success: false,
            message: 'Failed to report incident',
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info(`🔌 Client disconnected: ${clientId} (Reason: ${reason})`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`❌ Socket error for ${clientId}:`, error.message);
      });
    });

    // Log Socket.io server status
    logger.info('🔌 Socket.io server configured');
  }

  /**
   * Broadcast new incident to relevant clients
   */
  broadcastNewIncident(incident) {
    try {
      // Broadcast to all clients (will be refined with geographic filtering)
      this.io.emit('new_incident', {
        type: 'new_incident',
        data: incident,
        timestamp: new Date().toISOString(),
      });

      // Also broadcast to authenticated users room
      this.io.to('authenticated').emit('incident_notification', {
        type: 'notification',
        message: `New ${incident.type} reported`,
        incident: incident,
      });

      logger.debug('📡 New incident broadcasted to clients');
    } catch (error) {
      logger.error('❌ Failed to broadcast incident:', error.message);
    }
  }

  /**
   * Broadcast incident update to relevant clients
   */
  broadcastIncidentUpdate(incident) {
    try {
      this.io.emit('incident_updated', {
        type: 'incident_updated',
        data: incident,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`📡 Incident update broadcasted: ${incident.id}`);
    } catch (error) {
      logger.error('❌ Failed to broadcast incident update:', error.message);
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
  const server = new GISNetServer();
  server.start();
}

module.exports = GISNetServer;
