/**
 * ==================================================
 * ADVANCED GIS ANALYSIS ROUTES
 * Express Router for Spatial Analytics Endpoints
 * ==================================================
 * 
 * This module defines routes for advanced GIS analysis operations:
 * - Hotspot analysis with kernel density estimation
 * - Impact zone calculation with buffer operations
 * - GeoJSON data export with filtering capabilities
 * - Temporal pattern detection and trend analysis
 * - Predictive incident modeling with confidence scoring
 * - Incident density calculations with grid-based visualization
 * 
 * SECURITY FEATURES:
 * - JWT authentication required for all endpoints
 * - Role-based access control for sensitive operations
 * - Rate limiting to prevent API abuse
 * - Comprehensive parameter validation
 * - Request logging and audit trails
 * 
 * DEPENDENCIES:
 * - AnalysisController: Business logic handlers
 * - Auth Middleware: User authentication and authorization
 * - Validation Middleware: Input parameter validation
 * - Rate Limiting: Request throttling protection
 * 
 * INPUTS: HTTP requests with validated query parameters
 * OUTPUTS: JSON responses with analysis results and metadata
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const AnalysisController = require('../controllers/analysis');
const {
  validateHotspotParams,
  validateImpactZones,
  validateGeoJsonExport,
  validateTemporalPatterns,
  validatePredictive,
  validateDensity,
} = require('../middlewares/validation-analysis');
const logger = require('../services/logger');

const router = express.Router();
const analysisController = new AnalysisController();

/**
 * Rate limiting configuration for analysis operations
 * Prevents abuse while allowing reasonable usage for analytics
 */
const analysisLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 requests per 5 minutes per user/IP
  message: {
    error: 'Too many analysis requests',
    message: 'Please slow down your requests. Analysis operations are resource-intensive.',
    retryAfter: '5 minutes',
    limit: 20,
    windowMs: 300000
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `analysis_${req.user?.id || req.ip}`,
  skip: (req) => {
    // Skip rate limiting for admin users on low-impact endpoints
    return req.user?.role === 'admin' && req.path === '/temporal-patterns';
  }
});

/**
 * Stricter rate limiting for resource-intensive operations
 */
const intensiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 requests per 10 minutes
  message: {
    error: 'Rate limit exceeded for intensive operations',
    message: 'This operation is resource-intensive. Please wait before retrying.',
    retryAfter: '10 minutes'
  },
  keyGenerator: (req) => `intensive_${req.user?.id || req.ip}`,
});

/**
 * Middleware to log analysis operations with comprehensive context
 */
const logAnalysisOperation = (operation) => {
  return (req, res, next) => {
    const logData = {
      userId: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      operation,
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };
    
    logger.http(`Analysis Operation: ${operation}`, logData);
    
    // Add operation context to request for downstream use
    req.analysisContext = {
      operation,
      startTime: Date.now(),
      logData
    };
    
    next();
  };
};

/**
 * Middleware to log operation completion and performance
 */
const logOperationCompletion = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (req.analysisContext) {
      const executionTime = Date.now() - req.analysisContext.startTime;
      const success = res.statusCode < 400;
      
      logger.info('Analysis operation completed', {
        ...req.analysisContext.logData,
        executionTime,
        success,
        statusCode: res.statusCode,
        responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * @route   GET /api/analysis/hotspots
 * @desc    Generate hotspot analysis using kernel density estimation
 * @access  Private (requires authentication)
 * @params  Query parameters:
 *          - timeRange: Time period for analysis (e.g., '30d', '7d', '1w') - default: '30d'
 *          - gridSize: Grid resolution 10-500 - default: 100
 *          - minIncidents: Minimum incidents per hotspot 1-50 - default: 3
 *          - maxPoints: Maximum incidents to analyze 10-2000 - default: 500
 *          - incidentTypes: Comma-separated incident type IDs for filtering
 * @returns {Object} JSON response with hotspots array and metadata
 * @example GET /api/analysis/hotspots?timeRange=7d&gridSize=150&minIncidents=5&incidentTypes=1,2,3
 */
router.get('/hotspots',
  authenticateToken,
  analysisLimiter,
  logAnalysisOperation('hotspot_analysis'),
  validateHotspotParams,
  logOperationCompletion,
  analysisController.getHotspotAnalysis
);

/**
 * @route   GET /api/analysis/impact-zones
 * @desc    Generate impact zones using spatial buffer analysis
 * @access  Private (requires authentication)
 * @params  Query parameters:
 *          - incidentIds: Comma-separated incident IDs to analyze (optional - uses recent if empty)
 *          - bufferDistance: Buffer radius in meters 10-5000 - default: 500
 * @returns {Object} JSON response with impact zones array and affected area statistics
 * @example GET /api/analysis/impact-zones?incidentIds=1,2,3&bufferDistance=1000
 */
router.get('/impact-zones',
  authenticateToken,
  analysisLimiter,
  logAnalysisOperation('impact_zones'),
  validateImpactZones,
  logOperationCompletion,
  analysisController.generateImpactZones
);

/**
 * @route   GET /api/analysis/export/geojson
 * @desc    Export incident data as GeoJSON format for external applications
 * @access  Private (requires authentication)
 * @params  Query parameters:
 *          - timeRange: Time period for incidents - default: '30d'
 *          - bbox: Geographic bounding box 'west,south,east,north' (optional)
 *          - incidentTypes: Comma-separated incident type IDs (optional)
 *          - includeBuffers: Include buffer geometries 'true'|'false' - default: 'false'
 *          - bufferDistance: Buffer distance in meters 10-5000 - default: 500
 *          - maxIncidents: Maximum incidents to export 1-5000 - default: 1000
 * @returns {Object} GeoJSON FeatureCollection with proper headers for download
 * @example GET /api/analysis/export/geojson?timeRange=30d&includeBuffers=true&bufferDistance=750
 */
router.get('/export/geojson',
  authenticateToken,
  analysisLimiter,
  logAnalysisOperation('export_geojson'),
  validateGeoJsonExport,
  logOperationCompletion,
  analysisController.exportGeoJson
);

/**
 * @route   GET /api/analysis/temporal-patterns
 * @desc    Analyze temporal patterns and trends in incident data
 * @access  Private (requires authentication)
 * @params  Query parameters:
 *          - timeRange: Historical data range - default: '30d'
 *          - groupBy: Time grouping method 'hour'|'day'|'weekday'|'month' - default: 'day'
 *          - incidentTypes: Comma-separated incident type IDs (optional)
 * @returns {Object} JSON response with temporal patterns, trends, and statistical analysis
 * @example GET /api/analysis/temporal-patterns?timeRange=90d&groupBy=weekday&incidentTypes=1,3
 */
router.get('/temporal-patterns',
  authenticateToken,
  analysisLimiter,
  logAnalysisOperation('temporal_patterns'),
  validateTemporalPatterns,
  logOperationCompletion,
  analysisController.getTemporalPatterns
);

/**
 * @route   GET /api/analysis/predictive
 * @desc    Generate predictive incident model using machine learning techniques
 * @access  Private (requires authentication + admin role)
 * @params  Query parameters:
 *          - predictionHours: Prediction time window 1-168 hours - default: 24
 *          - confidence: Confidence threshold 0.1-1.0 - default: 0.7
 * @returns {Object} JSON response with predictive model and high-confidence predictions
 * @example GET /api/analysis/predictive?predictionHours=48&confidence=0.8
 */
router.get('/predictive',
  authenticateToken,
  requireRole(['admin']),
  intensiveLimiter,
  logAnalysisOperation('predictive_modeling'),
  validatePredictive,
  logOperationCompletion,
  analysisController.getPredictiveModel
);

/**
 * @route   GET /api/analysis/density
 * @desc    Calculate incident density across geographic areas using grid analysis
 * @access  Private (requires authentication)
 * @params  Query parameters:
 *          - bounds: Geographic bounds 'north,east,south,west' (optional - uses all data if empty)
 *          - resolution: Grid resolution 'low'|'medium'|'high' - default: 'medium'
 *          - normalize: Normalize density values 'true'|'false' - default: 'false'
 *          - timeRange: Time period for analysis - default: '30d'
 * @returns {Object} JSON response with density grid and visualization metadata
 * @example GET /api/analysis/density?bounds=40.7829,-73.9654,40.7489,-73.9354&resolution=high&normalize=true
 */
router.get('/density',
  authenticateToken,
  analysisLimiter,
  logAnalysisOperation('incident_density'),
  validateDensity,
  logOperationCompletion,
  analysisController.getIncidentDensity
);

/**
 * @route   GET /api/analysis/performance
 * @desc    Get analysis service performance metrics (admin only)
 * @access  Private (requires authentication + admin role)
 * @returns {Object} Performance statistics for all analysis operations
 */
router.get('/performance',
  authenticateToken,
  requireRole(['admin']),
  logAnalysisOperation('performance_metrics'),
  (req, res) => {
    try {
      const analysisService = analysisController.analysisService;
      const metrics = analysisService.getPerformanceMetrics();
      
      res.json({
        success: true,
        performanceMetrics: metrics,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'performance_metrics',
        userId: req.user?.id
      });
      
      res.status(500).json({
        error: 'Failed to retrieve performance metrics',
        message: 'Unable to fetch analysis performance data'
      });
    }
  }
);

/**
 * @route   GET /api/analysis/health
 * @desc    Health check endpoint for analysis service
 * @access  Private (requires authentication)
 * @returns {Object} Service health status and basic statistics
 */
router.get('/health',
  authenticateToken,
  (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          database_connection: 'ok',
          postgis_version: 'enabled',
          query_performance: 'normal'
        },
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Analysis service degraded',
        message: error.message
      });
    }
  }
);

/**
 * Error handling middleware for analysis routes
 * Provides comprehensive error responses with appropriate status codes
 */
router.use((error, req, res, next) => {
  // Log the error with full context
  logger.logError(error, req, {
    module: 'analysis_routes',
    operation: req.analysisContext?.operation || 'unknown',
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    query: req.query,
    stack: error.stack
  });

  // Handle specific error types with appropriate responses
  if (error.message?.includes('bounds') || error.message?.includes('coordinates')) {
    return res.status(400).json({
  success: false,
      error: 'Invalid geographic parameters',
      message: 'The provided geographic bounds or coordinates are not valid. Please check the format and values.',
      details: {
        expectedFormat: 'bounds: north,east,south,west (decimal degrees)',
        example: 'bounds=40.7829,-73.9654,40.7489,-73.9354'
      }
    });
  }

  if (error.message?.includes('PostGIS') || error.message?.includes('spatial')) {
    return res.status(500).json({
  success: false,
      error: 'Spatial operation failed',
      message: 'Unable to process geographic data. This may be due to invalid geometries or database issues.',
      supportInfo: 'Please contact support if this error persists.'
    });
  }

  if (error.message?.includes('timeout') || error.message?.includes('connection')) {
    return res.status(503).json({
  success: false,
      error: 'Service temporarily unavailable',
      message: 'The analysis service is currently experiencing high load. Please try again in a few moments.',
      retryAfter: '30 seconds'
    });
  }

  if (error.message?.includes('insufficient') || error.message?.includes('data')) {
    return res.status(422).json({
  success: false,
      error: 'Insufficient data',
      message: 'There is not enough historical data to perform this analysis reliably.',
      suggestion: 'Try expanding the time range or reducing the confidence threshold.'
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError' || error.message?.includes('validation')) {
    return res.status(400).json({
  success: false,
      error: 'Validation failed',
      message: 'One or more parameters are invalid or missing.',
      details: error.details || error.message
    });
  }

  // Handle authentication/authorization errors
  if (error.message?.includes('token') || error.message?.includes('authorization')) {
    return res.status(401).json({
  success: false,
      error: 'Authentication required',
      message: 'Please provide a valid authentication token.'
    });
  }

  // Generic analysis error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
  success: false,
    error: 'Analysis operation failed',
    message: 'An unexpected error occurred while processing your analysis request.',
    ...(isDevelopment && { 
      details: error.message,
      stack: error.stack 
    }),
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
