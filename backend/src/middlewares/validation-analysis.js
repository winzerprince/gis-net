/**
 * ANALYSIS VALIDATION MIDDLEWARE
 * Parameter Validation for GIS Analysis Endpoints
 */

const Joi = require('joi');
const logger = require('../services/logger');

// Validate hotspot analysis parameters
const hotspotSchema = Joi.object({
  timeRange: Joi.string().pattern(/^(\d+)([dhwmy])$/).default('30d'),
  gridSize: Joi.number().integer().min(10).max(500).default(100),
  minIncidents: Joi.number().integer().min(1).max(50).default(3),
  maxPoints: Joi.number().integer().min(10).max(2000).default(500),
  incidentTypes: Joi.string().pattern(/^\d+(,\d+)*$/).allow('').optional(),
  north: Joi.number().min(-90).max(90).optional(),
  south: Joi.number().min(-90).max(90).optional(),
  east: Joi.number().min(-180).max(180).optional(),
  west: Joi.number().min(-180).max(180).optional()
}).custom((value, helpers) => {
  // Optional safety: prevent excessively large geographic requests that would generate massive grids
  const hasBounds = ['north','south','east','west'].every(k => value[k] !== undefined);
  if (hasBounds && value.gridSize) {
    const north = Number(value.north);
    const south = Number(value.south);
    const east = Number(value.east);
    const west = Number(value.west);
    if ([north, south, east, west].every(Number.isFinite)) {
      const dLat = Math.abs(north - south);
      const dLon = Math.abs(east - west);
      // Estimated grid cell count ~ (dLat * gridSize) * (dLon * gridSize)
      const estimatedCells = dLat * value.gridSize * dLon * value.gridSize;
      // If estimated cells extremely large, reject to protect service (test expects 400)
      if (estimatedCells > 200000) {
        return helpers.error('any.invalid', { message: 'validation: oversized geographic bounds for selected grid size' });
      }
    }
  }
  return value;
}, 'bounds size check');

// Validate impact zones parameters
const impactZoneSchema = Joi.object({
  incidentIds: Joi.string().pattern(/^\d+(,\d+)*$/).allow('').optional(),
  bufferDistance: Joi.number().integer().min(10).max(5000).default(500),
  // Accept snake_case alias from clients/tests
  buffer_distance: Joi.number().integer().min(10).max(5000).optional()
}).custom((value, helpers) => {
  if (!value.bufferDistance && value.buffer_distance) {
    value.bufferDistance = value.buffer_distance;
  }
  return value;
}, 'buffer distance alias');

// Validate GeoJSON export parameters
const geoJsonSchema = Joi.object({
  timeRange: Joi.string().pattern(/^(\d+)([dhwmy])$/).default('30d'),
  bbox: Joi.string().pattern(/^[-\d.]+,[-\d.]+,[-\d.]+,[-\d.]+$/).allow('').optional(),
  incidentTypes: Joi.string().pattern(/^\d+(,\d+)*$/).allow('').optional(),
  // Accept aliases used by tests/clients
  incident_types: Joi.string().pattern(/^\d+(,\d+)*$/).allow('').optional(),
  includeBuffers: Joi.string().valid('true', 'false').default('false'),
  bufferDistance: Joi.number().integer().min(10).max(5000).default(500),
  maxIncidents: Joi.number().integer().min(1).max(5000).default(1000),
  include_analysis: Joi.string().valid('true','false').optional()
}).custom((value, helpers) => {
  if (!value.incidentTypes && value.incident_types) {
    value.incidentTypes = value.incident_types;
  }
  return value;
}, 'incident types alias');

// Validate temporal patterns parameters
// Support either timeRange/groupBy or start_date/end_date/granularity
const temporalSchema = Joi.object({
  timeRange: Joi.string().pattern(/^(\d+)([dhwmy])$/).default('30d'),
  groupBy: Joi.string().valid('hour', 'day', 'weekday', 'month').default('day'),
  incidentTypes: Joi.string().pattern(/^\d+(,\d+)*$/).allow('').optional(),
  start_date: Joi.string().isoDate().optional(),
  end_date: Joi.string().isoDate().optional(),
  granularity: Joi.string().valid('hour', 'day', 'weekday', 'month').optional()
}).custom((value, helpers) => {
  // If start/end provided, enforce end <= now and start <= end
  if (value.start_date || value.end_date || value.granularity) {
    const now = new Date();
    const start = value.start_date ? new Date(value.start_date) : null;
    const end = value.end_date ? new Date(value.end_date) : null;
    if (end && end > now) {
      return helpers.error('any.invalid', { message: 'validation: end_date cannot be in the future' });
    }
    if (start && end && start > end) {
      return helpers.error('any.invalid', { message: 'validation: start_date must be before end_date' });
    }
  }
  return value;
}, 'temporal date validation');

// Validate predictive model parameters
const predictiveSchema = Joi.object({
  predictionHours: Joi.number().integer().min(1).max(168).default(24),
  confidence: Joi.number().min(0.1).max(1.0).default(0.7),
  clusters: Joi.number().integer().min(1).max(50).optional(),
  cluster_count: Joi.number().integer().min(1).max(50).optional()
}).custom((value, helpers) => {
  // Alias cluster_count -> clusters
  if (!value.clusters && value.cluster_count) {
    value.clusters = value.cluster_count;
  }
  return value;
}, 'cluster alias');

// Validate density analysis parameters
const densitySchema = Joi.object({
  bounds: Joi.string().pattern(/^[-\d.]+,[-\d.]+,[-\d.]+,[-\d.]+$/).allow('').optional(),
  // Accept explicit north/south/east/west too
  north: Joi.number().min(-90).max(90).optional(),
  south: Joi.number().min(-90).max(90).optional(),
  east: Joi.number().min(-180).max(180).optional(),
  west: Joi.number().min(-180).max(180).optional(),
  resolution: Joi.string().valid('low', 'medium', 'high').default('medium'),
  normalize: Joi.string().valid('true', 'false').default('false'),
  timeRange: Joi.string().pattern(/^(\d+)([dhwmy])$/).default('30d'),
  // direct cell size override for tests
  cell_size: Joi.number().min(0.00001).max(1).optional()
}).custom((value, helpers) => {
  // If bounds string not provided but individual edges are, combine
  const edges = ['north','south','east','west'];
  const hasEdges = edges.every(k => value[k] !== undefined);
  if (!value.bounds && hasEdges) {
    value.bounds = `${value.north},${value.east},${value.south},${value.west}`;
  }
  return value;
}, 'bounds alias');

/**
 * Generic validation middleware creator
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      logger.warn('Validation failed', {
        path: req.path,
        errors: error.details.map(e => e.message),
        userId: req.user?.id,
      });

      return res.status(400).json({
        success: false,
  error: 'validation failed',
        message: 'Invalid parameters',
        details: error.details.map(e => e.message),
      });
    }

    // Update req.query with validated values
    req.query = value;
    next();
  };
};

// Export validation middleware
module.exports = {
  validateHotspotParams: validate(hotspotSchema),
  validateImpactZones: validate(impactZoneSchema),
  validateGeoJsonExport: validate(geoJsonSchema),
  validateTemporalPatterns: validate(temporalSchema),
  validatePredictive: validate(predictiveSchema),
  validateDensity: validate(densitySchema),
};
