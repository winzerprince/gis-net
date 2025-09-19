/**
 * ==================================================
 * INCIDENT MANAGEMENT ROUTES
 * Express Router for Traffic Incident Operations
 * ==================================================
 * 
 * This module defines comprehensive routes for traffic incident management
 * including CRUD operations, spatial queries, real-time features, and
 * analytics. All routes are protected with authentication and include
 * proper validation, rate limiting, and error handling.
 * 
 * ROUTE STRUCTURE:
 * - POST /api/incidents: Create new incident report
 * - GET /api/incidents: Search incidents with spatial filtering
 * - GET /api/incidents/types: Get available incident types
 * - GET /api/incidents/clusters: Generate incident clusters for maps
 * - GET /api/incidents/heatmap: Generate heatmap data points
 * - GET /api/incidents/statistics: Get incident analytics
 * - GET /api/incidents/:id: Get specific incident details
 * - PUT /api/incidents/:id: Update existing incident
 * - DELETE /api/incidents/:id: Delete incident (soft delete)
 * - POST /api/incidents/:id/verify: Community verification
 * 
 * SECURITY FEATURES:
 * - Authentication required for all endpoints
 * - Ownership validation for updates/deletions
 * - Rate limiting for incident creation and verification
 * - Input validation and sanitization
 * - Comprehensive request logging
 * 
 * REAL-TIME FEATURES:
 * - Socket.io integration for live incident updates
 * - Geographic area subscriptions
 * - User notifications for owned incidents
 * - Community verification broadcasts
 * 
 * DEPENDENCIES:
 * - IncidentController: Business logic handlers
 * - Auth Middleware: User authentication
 * - Validation Middleware: Input validation
 * - Rate Limiting: Endpoint protection
 * - Logger: Request and security logging
 * 
 * USAGE:
 * const incidentRoutes = require('./routes/incidents');
 * app.use('/api/incidents', incidentRoutes);
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const {
  validateIncidentCreation,
  validateIncidentUpdate,
  validateSpatialSearch,
  validateClusterParams,
  validateHeatmapParams,
} = require('../middlewares/validation-incident');
const IncidentController = require('../controllers/incident');
const IncidentService = require('../services/incident');
const logger = require('../services/logger');

const router = express.Router();

// Initialize service and controller
const incidentService = new IncidentService();
// Note: Socket.io instance will be injected when the app starts
let incidentController = new IncidentController(incidentService, null);

/**
 * Set Socket.io instance for real-time features
 * This will be called from the main app when Socket.io is initialized
 */
const setSocketIO = (io) => {
  incidentController = new IncidentController(incidentService, io);
};

/**
 * Rate limiting for incident operations
 */

// Strict rate limiting for incident creation (prevents spam)
const incidentCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 incidents per 5 minutes per user
  message: {
    error: 'Too many incident reports',
    message: 'Please wait 5 minutes before reporting another incident',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `incident_create_${req.user?.id || req.ip}`,
});

// Moderate rate limiting for incident verification
const verificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 verifications per minute per user
  message: {
    error: 'Too many verification attempts',
    message: 'Please wait before verifying more incidents',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `verify_${req.user?.id || req.ip}`,
});

// General rate limiting for incident queries
const queryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per user
  message: {
    error: 'Too many requests',
    message: 'Please slow down your requests',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `query_${req.user?.id || req.ip}`,
});

/**
 * Middleware to log all incident operations
 */
const logIncidentOperation = (operation) => {
  return (req, res, next) => {
    logger.http(`Incident: ${operation}`, {
      userId: req.user?.id,
      username: req.user?.username,
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
      body: operation.includes('create') || operation.includes('update') ? req.body : undefined,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    next();
  };
};

/**
 * @route   POST /api/incidents
 * @desc    Create a new traffic incident report
 * @access  Private (requires authentication)
 * @body    { typeId, description, latitude, longitude, severity?, address?, estimatedDuration?, affectedLanes? }
 * @returns { incident, message }
 */
router.post('/',
  authenticateToken,
  incidentCreationLimiter,
  logIncidentOperation('create'),
  validateIncidentCreation,
  incidentController.createIncident
);

/**
 * @route   GET /api/incidents
 * @desc    Search incidents with spatial and temporal filtering
 * @access  Private (requires authentication)
 * @query   ?latitude=&longitude=&radius=&typeId=&severity=&verified=&page=&limit=&sortBy=&sortOrder=
 * @returns { incidents, pagination, searchParams }
 */
router.get('/',
  authenticateToken,
  queryLimiter,
  logIncidentOperation('search'),
  validateSpatialSearch,
  incidentController.getIncidents
);

/**
 * @route   GET /api/incidents/types
 * @desc    Get all available incident types for form dropdowns
 * @access  Private (requires authentication)
 * @returns { incidentTypes }
 */
router.get('/types',
  authenticateToken,
  logIncidentOperation('get_types'),
  incidentController.getIncidentTypes
);

/**
 * @route   GET /api/incidents/clusters
 * @desc    Generate incident clusters for map visualization
 * @access  Private (requires authentication)
 * @query   ?bounds={north,south,east,west}&clusterCount=&minSeverity=&includeExpired=
 * @returns { clusters, parameters }
 */
router.get('/clusters',
  authenticateToken,
  queryLimiter,
  logIncidentOperation('get_clusters'),
  validateClusterParams,
  incidentController.getIncidentClusters
);

/**
 * @route   GET /api/incidents/heatmap
 * @desc    Generate heatmap data for incident density visualization
 * @access  Private (requires authentication)
 * @query   ?bounds={north,south,east,west}&gridSize=&minSeverity=&timeRange=&includeExpired=
 * @returns { heatmapPoints, parameters }
 */
router.get('/heatmap',
  authenticateToken,
  queryLimiter,
  logIncidentOperation('get_heatmap'),
  validateHeatmapParams,
  incidentController.getHeatmapData
);

/**
 * @route   GET /api/incidents/statistics
 * @desc    Get incident statistics for reporting and analytics
 * @access  Private (requires authentication)
 * @query   ?timeRange=&groupBy=&includeExpired=
 * @returns { statistics, parameters }
 */
router.get('/statistics',
  authenticateToken,
  queryLimiter,
  logIncidentOperation('get_statistics'),
  incidentController.getIncidentStatistics
);

/**
 * @route   GET /api/incidents/:id
 * @desc    Get specific incident details by ID
 * @access  Private (requires authentication)
 * @param   id - Incident ID
 * @returns { incident }
 */
router.get('/:id',
  authenticateToken,
  logIncidentOperation('get_by_id'),
  incidentController.getIncidentById
);

/**
 * @route   PUT /api/incidents/:id
 * @desc    Update existing incident (owner or admin only)
 * @access  Private (requires authentication and ownership)
 * @param   id - Incident ID
 * @body    { description?, severity?, address?, estimatedDuration?, affectedLanes? }
 * @returns { incident, message }
 */
router.put('/:id',
  authenticateToken,
  logIncidentOperation('update'),
  validateIncidentUpdate,
  incidentController.updateIncident
);

/**
 * @route   DELETE /api/incidents/:id
 * @desc    Delete incident (soft delete - owner or admin only)
 * @access  Private (requires authentication and ownership)
 * @param   id - Incident ID
 * @returns { success, message, incidentId }
 */
router.delete('/:id',
  authenticateToken,
  logIncidentOperation('delete'),
  incidentController.deleteIncident
);

/**
 * @route   POST /api/incidents/:id/verify
 * @desc    Add community verification to an incident
 * @access  Private (requires authentication)
 * @param   id - Incident ID
 * @returns { verificationCount, isVerified, message }
 */
router.post('/:id/verify',
  authenticateToken,
  verificationLimiter,
  logIncidentOperation('verify'),
  incidentController.verifyIncident
);

/**
 * @route   GET /api/incidents/:id/verifications
 * @desc    Get verification details for an incident (admin only)
 * @access  Private (requires admin role)
 * @param   id - Incident ID
 * @returns { verifications }
 */
router.get('/:id/verifications',
  authenticateToken,
  requireRole('admin'),
  logIncidentOperation('get_verifications'),
  async (req, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      
      if (!incidentId || isNaN(incidentId)) {
        return res.status(400).json({
          error: 'Invalid incident ID',
          message: 'Incident ID must be a valid number',
        });
      }

      const query = `
        SELECT 
          iv.id,
          iv.created_at,
          u.username,
          u.id as user_id
        FROM incident_verifications iv
        JOIN users u ON u.id = iv.user_id
        WHERE iv.incident_id = $1
        ORDER BY iv.created_at DESC
      `;

      const result = await incidentService.db.query(query, [incidentId]);

      res.json({
        success: true,
        verifications: result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          verifiedAt: row.created_at,
        })),
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incident_verifications',
        incidentId: req.params.id,
      });

      res.status(500).json({
        error: 'Failed to retrieve verifications',
        message: 'Unable to get incident verification details',
      });
    }
  }
);

/**
 * @route   POST /api/incidents/cleanup-expired
 * @desc    Clean up expired incidents (admin only - typically run by cron job)
 * @access  Private (requires admin role)
 * @returns { cleanedCount, message }
 */
router.post('/cleanup-expired',
  authenticateToken,
  requireRole('admin'),
  logIncidentOperation('cleanup_expired'),
  async (req, res) => {
    try {
      logger.info('Incident: Manual expired incident cleanup initiated', {
        userId: req.user.id,
        username: req.user.username,
      });

      const result = await incidentService.cleanupExpiredIncidents();

      logger.info('Incident: Expired incident cleanup completed', {
        userId: req.user.id,
        cleanedCount: result.cleanedCount,
      });

      res.json({
        success: true,
        message: `Successfully cleaned up ${result.cleanedCount} expired incidents`,
        cleanedCount: result.cleanedCount,
        cleanedIncidents: result.cleanedIncidents,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'cleanup_expired_incidents',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Cleanup failed',
        message: 'Unable to clean up expired incidents',
      });
    }
  }
);

/**
 * Error handling middleware for incident routes
 */
router.use((error, req, res, next) => {
  logger.logError(error, req, {
    module: 'incident_routes',
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  // Handle specific incident-related errors
  if (error.message?.includes('coordinate') || error.message?.includes('location')) {
    return res.status(400).json({
      error: 'Invalid location',
      message: 'The provided coordinates are not valid',
    });
  }

  if (error.message?.includes('rate limit')) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
    });
  }

  if (error.message?.includes('validation')) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input and try again',
    });
  }

  if (error.message?.includes('PostGIS') || error.message?.includes('spatial')) {
    return res.status(500).json({
      error: 'Spatial operation failed',
      message: 'Unable to process geographic data',
    });
  }

  // Generic incident error response
  res.status(500).json({
    error: 'Incident operation failed',
    message: 'An error occurred while processing your request',
  });
});

// Export router and Socket.io setter
module.exports = {
  router,
  setSocketIO,
};
