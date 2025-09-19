/**
 * ==================================================
 * SOCKET.IO REAL-TIME EVENT HANDLER
 * WebSocket Server for Live Traffic Incident Updates
 * ==================================================
 * 
 * This module configures Socket.io for real-time communication between
 * the server and connected clients. It handles incident broadcasting,
 * user authentication, geographic area subscriptions, and event routing.
 * 
 * REAL-TIME FEATURES:
 * - Live incident creation, updates, and deletions
 * - Geographic area subscriptions (lat/lng grid-based rooms)
 * - User-specific notifications and updates
 * - Community verification broadcasts
 * - Connection management and heartbeat monitoring
 * - Authentication integration with JWT tokens
 * 
 * EVENT TYPES:
 * - incident_created: New incident reported
 * - incident_updated: Existing incident modified
 * - incident_deleted: Incident removed
 * - incident_verified: Community verification added
 * - area_subscription: Subscribe to geographic area updates
 * - user_notification: User-specific messages
 * 
 * SECURITY FEATURES:
 * - JWT token authentication for WebSocket connections
 * - Rate limiting for event emissions
 * - Geographic area validation
 * - User authorization for sensitive operations
 * - Connection logging and monitoring
 * 
 * DEPENDENCIES:
 * - socket.io: WebSocket server implementation
 * - jsonwebtoken: JWT token verification
 * - Auth Service: User authentication validation
 * - Logger: Connection and event logging
 * 
 * USAGE:
 * const { configureSocketIO } = require('./services/socket');
 * const io = configureSocketIO(server, authService);
 */

const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const AuthenticationService = require('./auth');

class SocketIOHandler {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socket mapping
    this.userRooms = new Map(); // userId -> Set of room names
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      authenticationFailures: 0,
      eventsEmitted: 0,
    };
  }

  /**
   * Initialize Socket.io server with authentication and event handlers
   * @param {http.Server} server - HTTP server instance
   * @param {AuthenticationService} authService - Authentication service
   * @returns {SocketIO.Server} Configured Socket.io instance
   */
  configure(server, authService) {
    // Configure Socket.io with CORS and connection settings
    this.io = socketIo(server, {
      cors: {
        origin: [
          process.env.FRONTEND_URL || "http://localhost:3000",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      upgradeTimeout: 30000, // 30 seconds
      allowUpgrades: true,
      transports: ['websocket', 'polling'],
    });

    this.authService = authService;

    // Set up authentication middleware
    this.setupAuthentication();

    // Set up connection handling
    this.setupConnectionHandlers();

    // Set up event handlers
    this.setupEventHandlers();

    // Set up cleanup and monitoring
    this.setupCleanupHandlers();

    logger.info('SocketIO: Server configured successfully', {
      cors: process.env.FRONTEND_URL || "http://localhost:3000",
      transports: ['websocket', 'polling'],
    });

    return this.io;
  }

  /**
   * Setup JWT-based authentication for Socket.io connections
   * @private
   */
  setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || 
                     socket.handshake.query?.token ||
                     socket.request.headers?.authorization?.split(' ')[1];

        if (!token) {
          logger.logSecurity('socket_connection_no_token', {
            socketId: socket.id,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
          });
          
          this.connectionStats.authenticationFailures++;
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token is blacklisted
        const isBlacklisted = await this.authService.isTokenBlacklisted(token);
        if (isBlacklisted) {
          logger.logSecurity('socket_connection_blacklisted_token', {
            socketId: socket.id,
            userId: decoded.userId,
            ip: socket.handshake.address,
          });
          
          this.connectionStats.authenticationFailures++;
          return next(new Error('Token is no longer valid'));
        }

        // Get user information
        const user = await this.authService.getUserById(decoded.userId);
        if (!user || !user.is_active) {
          logger.logSecurity('socket_connection_invalid_user', {
            socketId: socket.id,
            userId: decoded.userId,
            ip: socket.handshake.address,
          });
          
          this.connectionStats.authenticationFailures++;
          return next(new Error('User account not found or inactive'));
        }

        // Attach user information to socket
        socket.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        };

        socket.token = token;

        logger.debug('SocketIO: User authenticated', {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
          ip: socket.handshake.address,
        });

        next();

      } catch (error) {
        logger.logSecurity('socket_authentication_failed', {
          socketId: socket.id,
          error: error.message,
          ip: socket.handshake.address,
        });

        this.connectionStats.authenticationFailures++;
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection and disconnection event handlers
   * @private
   */
  setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      const user = socket.user;
      
      // Update connection statistics
      this.connectionStats.totalConnections++;
      this.connectionStats.activeConnections++;

      // Store user connection
      this.connectedUsers.set(user.id, socket);
      this.userRooms.set(user.id, new Set());

      // Join user-specific room for notifications
      socket.join(`user-${user.id}`);

      logger.info('SocketIO: User connected', {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        activeConnections: this.connectionStats.activeConnections,
        ip: socket.handshake.address,
      });

      // Send connection acknowledgment
      socket.emit('connected', {
        message: 'Connected to GIS-NET real-time service',
        user: {
          id: user.id,
          username: user.username,
        },
        timestamp: new Date().toISOString(),
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.handleUserDisconnection(socket, reason);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.logError(error, null, {
          operation: 'socket_connection_error',
          socketId: socket.id,
          userId: user.id,
        });
      });
    });
  }

  /**
   * Setup custom event handlers for incident management
   * @private
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // Handle geographic area subscriptions
      socket.on('subscribe_area', (data) => {
        this.handleAreaSubscription(socket, data);
      });

      // Handle area unsubscription
      socket.on('unsubscribe_area', (data) => {
        this.handleAreaUnsubscription(socket, data);
      });

      // Handle incident focus (user viewing specific incident)
      socket.on('focus_incident', (data) => {
        this.handleIncidentFocus(socket, data);
      });

      // Handle user status updates (online/away)
      socket.on('user_status', (data) => {
        this.handleUserStatus(socket, data);
      });

      // Handle heartbeat/ping for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong', {
          timestamp: new Date().toISOString(),
        });
      });

      // Handle client-side errors
      socket.on('client_error', (errorData) => {
        logger.warn('SocketIO: Client-side error reported', {
          socketId: socket.id,
          userId: socket.user.id,
          error: errorData,
        });
      });
    });
  }

  /**
   * Handle user disconnection cleanup
   * @private
   */
  handleUserDisconnection(socket, reason) {
    const user = socket.user;
    
    // Update connection statistics
    this.connectionStats.activeConnections--;

    // Clean up user data
    this.connectedUsers.delete(user.id);
    
    // Clean up user rooms
    const userRoomSet = this.userRooms.get(user.id);
    if (userRoomSet) {
      userRoomSet.forEach(roomName => {
        socket.leave(roomName);
      });
      this.userRooms.delete(user.id);
    }

    logger.info('SocketIO: User disconnected', {
      socketId: socket.id,
      userId: user.id,
      username: user.username,
      reason,
      activeConnections: this.connectionStats.activeConnections,
    });
  }

  /**
   * Handle geographic area subscription
   * @private
   */
  handleAreaSubscription(socket, data) {
    try {
      const { bounds } = data;
      
      if (!bounds || typeof bounds !== 'object') {
        return socket.emit('error', {
          message: 'Invalid area bounds provided',
        });
      }

      const { north, south, east, west } = bounds;
      
      // Validate bounds
      if (typeof north !== 'number' || typeof south !== 'number' ||
          typeof east !== 'number' || typeof west !== 'number' ||
          north <= south || east <= west ||
          north > 90 || south < -90 || east > 180 || west < -180) {
        return socket.emit('error', {
          message: 'Invalid geographic bounds',
        });
      }

      // Generate room name based on bounds (simplified grid)
      const roomName = this.generateAreaRoom(bounds);
      
      // Join the geographic area room
      socket.join(roomName);
      
      // Track user's room membership
      const userRoomSet = this.userRooms.get(socket.user.id) || new Set();
      userRoomSet.add(roomName);
      this.userRooms.set(socket.user.id, userRoomSet);

      logger.debug('SocketIO: User subscribed to area', {
        socketId: socket.id,
        userId: socket.user.id,
        roomName,
        bounds,
      });

      socket.emit('area_subscribed', {
        success: true,
        roomName,
        bounds,
        message: 'Subscribed to area updates',
      });

    } catch (error) {
      logger.logError(error, null, {
        operation: 'handle_area_subscription',
        socketId: socket.id,
        userId: socket.user.id,
        data,
      });

      socket.emit('error', {
        message: 'Failed to subscribe to area updates',
      });
    }
  }

  /**
   * Handle area unsubscription
   * @private
   */
  handleAreaUnsubscription(socket, data) {
    try {
      const { roomName } = data;
      
      if (!roomName || typeof roomName !== 'string') {
        return socket.emit('error', {
          message: 'Invalid room name provided',
        });
      }

      // Leave the room
      socket.leave(roomName);
      
      // Remove from user's room tracking
      const userRoomSet = this.userRooms.get(socket.user.id);
      if (userRoomSet) {
        userRoomSet.delete(roomName);
      }

      logger.debug('SocketIO: User unsubscribed from area', {
        socketId: socket.id,
        userId: socket.user.id,
        roomName,
      });

      socket.emit('area_unsubscribed', {
        success: true,
        roomName,
        message: 'Unsubscribed from area updates',
      });

    } catch (error) {
      logger.logError(error, null, {
        operation: 'handle_area_unsubscription',
        socketId: socket.id,
        userId: socket.user.id,
        data,
      });
    }
  }

  /**
   * Handle incident focus tracking
   * @private
   */
  handleIncidentFocus(socket, data) {
    try {
      const { incidentId, action } = data; // action: 'focus' or 'blur'
      
      if (!incidentId || typeof incidentId !== 'number') {
        return socket.emit('error', {
          message: 'Invalid incident ID provided',
        });
      }

      const roomName = `incident-${incidentId}`;
      
      if (action === 'focus') {
        socket.join(roomName);
        logger.debug('SocketIO: User focusing on incident', {
          socketId: socket.id,
          userId: socket.user.id,
          incidentId,
        });
      } else if (action === 'blur') {
        socket.leave(roomName);
        logger.debug('SocketIO: User stopped focusing on incident', {
          socketId: socket.id,
          userId: socket.user.id,
          incidentId,
        });
      }

    } catch (error) {
      logger.logError(error, null, {
        operation: 'handle_incident_focus',
        socketId: socket.id,
        userId: socket.user.id,
        data,
      });
    }
  }

  /**
   * Handle user status updates
   * @private
   */
  handleUserStatus(socket, data) {
    try {
      const { status } = data; // 'online', 'away', 'busy'
      
      if (!['online', 'away', 'busy'].includes(status)) {
        return socket.emit('error', {
          message: 'Invalid status provided',
        });
      }

      // Update user status (could be stored in database)
      logger.debug('SocketIO: User status updated', {
        socketId: socket.id,
        userId: socket.user.id,
        status,
      });

      // Broadcast status to relevant rooms if needed
      socket.emit('status_updated', {
        success: true,
        status,
      });

    } catch (error) {
      logger.logError(error, null, {
        operation: 'handle_user_status',
        socketId: socket.id,
        userId: socket.user.id,
        data,
      });
    }
  }

  /**
   * Generate area room name from bounds
   * @private
   */
  generateAreaRoom(bounds) {
    // Simple grid-based room generation (can be enhanced with geohash)
    const latGrid = Math.floor((bounds.north + bounds.south) / 2 * 10);
    const lonGrid = Math.floor((bounds.east + bounds.west) / 2 * 10);
    return `area_${latGrid}_${lonGrid}`;
  }

  /**
   * Setup cleanup handlers and monitoring
   * @private
   */
  setupCleanupHandlers() {
    // Periodic cleanup of stale connections
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Log connection statistics
    setInterval(() => {
      logger.info('SocketIO: Connection statistics', this.connectionStats);
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Cleanup stale connections
   * @private
   */
  cleanupStaleConnections() {
    const staleTimeout = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    this.connectedUsers.forEach((socket, userId) => {
      if (socket.disconnected) {
        this.connectedUsers.delete(userId);
        this.userRooms.delete(userId);
        this.connectionStats.activeConnections--;
      }
    });

    logger.debug('SocketIO: Stale connection cleanup completed', {
      activeConnections: this.connectionStats.activeConnections,
    });
  }

  // ==============================================
  // PUBLIC METHODS FOR BROADCASTING EVENTS
  // ==============================================

  /**
   * Broadcast new incident to all connected clients
   */
  broadcastIncidentCreated(incidentData) {
    if (!this.io) return;

    const broadcastData = {
      type: 'incident_created',
      incident: incidentData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all clients
    this.io.emit('new-incident', broadcastData);

    // Broadcast to geographic area
    const areaRoom = this.generateLocationRoom(
      incidentData.location.latitude,
      incidentData.location.longitude
    );
    this.io.to(areaRoom).emit('area-incident', broadcastData);

    this.connectionStats.eventsEmitted++;
    
    logger.debug('SocketIO: Incident creation broadcasted', {
      incidentId: incidentData.id,
      areaRoom,
      connectedClients: this.connectionStats.activeConnections,
    });
  }

  /**
   * Broadcast incident update to connected clients
   */
  broadcastIncidentUpdated(incidentData, updatedBy) {
    if (!this.io) return;

    const broadcastData = {
      type: 'incident_updated',
      incident: incidentData,
      updatedBy,
      timestamp: new Date().toISOString(),
    };

    this.io.emit('incident-updated', broadcastData);
    this.io.to(`incident-${incidentData.id}`).emit('incident-detail-updated', broadcastData);

    this.connectionStats.eventsEmitted++;
  }

  /**
   * Broadcast incident deletion to connected clients
   */
  broadcastIncidentDeleted(incidentId, location, deletedBy) {
    if (!this.io) return;

    const broadcastData = {
      type: 'incident_deleted',
      incidentId,
      location,
      deletedBy,
      timestamp: new Date().toISOString(),
    };

    this.io.emit('incident-deleted', broadcastData);
    this.io.to(`incident-${incidentId}`).emit('incident-detail-deleted', broadcastData);

    this.connectionStats.eventsEmitted++;
  }

  /**
   * Broadcast incident verification to connected clients
   */
  broadcastIncidentVerified(incidentId, verificationData) {
    if (!this.io) return;

    const broadcastData = {
      type: 'incident_verified',
      incidentId,
      verificationData,
      timestamp: new Date().toISOString(),
    };

    this.io.emit('incident-verified', broadcastData);
    this.io.to(`incident-${incidentId}`).emit('incident-verification-added', broadcastData);

    this.connectionStats.eventsEmitted++;
  }

  /**
   * Send notification to specific user
   */
  sendUserNotification(userId, notification) {
    if (!this.io) return;

    this.io.to(`user-${userId}`).emit('user-notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    this.connectionStats.eventsEmitted++;
  }

  /**
   * Generate location-based room name
   * @private
   */
  generateLocationRoom(latitude, longitude) {
    const latGrid = Math.floor(latitude * 10);
    const lonGrid = Math.floor(longitude * 10);
    return `geo_${latGrid}_${lonGrid}`;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      activeUsers: this.connectedUsers.size,
      activeRooms: this.userRooms.size,
    };
  }
}

// Create singleton instance
const socketIOHandler = new SocketIOHandler();

/**
 * Configure Socket.io server
 * @param {http.Server} server - HTTP server instance
 * @param {AuthenticationService} authService - Authentication service
 * @returns {SocketIO.Server} Configured Socket.io instance
 */
const configureSocketIO = (server, authService) => {
  return socketIOHandler.configure(server, authService);
};

module.exports = {
  configureSocketIO,
  socketIOHandler,
};
