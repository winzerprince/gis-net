/**
 * ==================================================
 * INCIDENT VALIDATION SCHEMAS
 * Comprehensive Joi Validation for Incident Management
 * ==================================================
 * 
 * This module provides robust validation schemas for all incident-related
 * operations including CRUD operations, spatial queries, and GIS analytics.
 * All schemas include proper error messaging and security considerations.
 * 
 * VALIDATION CATEGORIES:
 * - Incident Creation: Type, coordinates, description validation
 * - Incident Updates: Partial update validation with ownership
 * - Spatial Queries: Coordinate bounds, radius, filtering
 * - Clustering: K-means parameters and bounds validation
 * - Heatmaps: Grid resolution and temporal filtering
 * 
 * SECURITY FEATURES:
 * - Coordinate bounds validation (prevent invalid locations)
 * - Input sanitization (XSS protection)
 * - Parameter limits (prevent resource exhaustion)
 * - Type validation (prevent injection attacks)
 * 
 * DEPENDENCIES:
 * - joi: Schema validation library
 * - Custom validators: Coordinate validation, bounds checking
 * 
 * USAGE:
 * const { validateIncidentCreation } = require('./validation/incident');
 * app.post('/incidents', validateIncidentCreation, createHandler);
 */

const Joi = require('joi');

// ==============================================
// COORDINATE AND BOUNDS VALIDATION
// ==============================================

/**
 * Coordinate validation with proper bounds checking
 * Validates latitude/longitude pairs within Earth's coordinate system
 */
const coordinateSchema = Joi.object({
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.base': 'Latitude must be a number',
      'number.min': 'Latitude must be between -90 and 90 degrees',
      'number.max': 'Latitude must be between -90 and 90 degrees',
      'any.required': 'Latitude is required',
    }),
  
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.base': 'Longitude must be a number',
      'number.min': 'Longitude must be between -180 and 180 degrees',
      'number.max': 'Longitude must be between -180 and 180 degrees',
      'any.required': 'Longitude is required',
    }),
});

/**
 * Bounds validation for map regions
 * Used for clustering, heatmaps, and spatial filtering
 */
const boundsSchema = Joi.object({
  north: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.base': 'North bound must be a number',
      'number.min': 'North bound must be between -90 and 90 degrees',
      'number.max': 'North bound must be between -90 and 90 degrees',
      'any.required': 'North bound is required',
    }),

  south: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.base': 'South bound must be a number',
      'number.min': 'South bound must be between -90 and 90 degrees',
      'number.max': 'South bound must be between -90 and 90 degrees',
      'any.required': 'South bound is required',
    }),

  east: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.base': 'East bound must be a number',
      'number.min': 'East bound must be between -180 and 180 degrees',
      'number.max': 'East bound must be between -180 and 180 degrees',
      'any.required': 'East bound is required',
    }),

  west: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.base': 'West bound must be a number',
      'number.min': 'West bound must be between -180 and 180 degrees',
      'number.max': 'West bound must be between -180 and 180 degrees',
      'any.required': 'West bound is required',
    }),
}).custom((value, helpers) => {
  // Validate logical bounds relationships
  if (value.north <= value.south) {
    return helpers.error('custom.bounds', { 
      message: 'North boundary must be greater than south boundary' 
    });
  }
  
  // Handle longitude wraparound (e.g., crossing International Date Line)
  if (value.east < value.west) {
    // This is valid when crossing the 180° meridian
    // But we'll require explicit handling for now
    return helpers.error('custom.bounds', { 
      message: 'East boundary must be greater than west boundary (longitude wraparound not supported)' 
    });
  }
  
  return value;
});

// ==============================================
// INCIDENT CRUD VALIDATION
// ==============================================

/**
 * Incident creation validation schema
 * Validates all required fields for new incident reports
 */
const incidentCreationSchema = Joi.object({
  typeId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'Incident type ID must be a number',
      'number.integer': 'Incident type ID must be an integer',
      'number.positive': 'Incident type ID must be positive',
      'any.required': 'Incident type is required',
    }),

  description: Joi.string()
    .min(10)
    .max(1000)
    .trim()
    .required()
    .pattern(/^[^<>]*$/) // Prevent HTML tags for basic XSS protection
    .messages({
      'string.base': 'Description must be text',
      'string.empty': 'Description cannot be empty',
      'string.min': 'Description must be at least 10 characters',
      'string.max': 'Description cannot exceed 1000 characters',
      'string.pattern.base': 'Description cannot contain HTML tags',
      'any.required': 'Description is required',
    }),

  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.base': 'Latitude must be a number',
      'number.min': 'Latitude must be between -90 and 90 degrees',
      'number.max': 'Latitude must be between -90 and 90 degrees',
      'any.required': 'Latitude is required for incident location',
    }),

  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.base': 'Longitude must be a number',
      'number.min': 'Longitude must be between -180 and 180 degrees',
      'number.max': 'Longitude must be between -180 and 180 degrees',
      'any.required': 'Longitude is required for incident location',
    }),

  severity: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
    .messages({
      'number.base': 'Severity must be a number',
      'number.integer': 'Severity must be an integer',
      'number.min': 'Severity must be between 1 (low) and 5 (critical)',
      'number.max': 'Severity must be between 1 (low) and 5 (critical)',
    }),

  address: Joi.string()
    .max(200)
    .trim()
    .optional()
    .allow('')
    .pattern(/^[^<>]*$/)
    .messages({
      'string.max': 'Address cannot exceed 200 characters',
      'string.pattern.base': 'Address cannot contain HTML tags',
    }),

  estimatedDuration: Joi.number()
    .integer()
    .min(1)
    .max(43200) // 30 days in minutes (30 * 24 * 60)
    .optional()
    .messages({
      'number.base': 'Estimated duration must be a number',
      'number.integer': 'Estimated duration must be an integer (minutes)',
      'number.min': 'Estimated duration must be at least 1 minute',
      'number.max': 'Estimated duration cannot exceed 30 days (43,200 minutes)',
    }),

  affectedLanes: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .optional()
    .messages({
      'number.base': 'Affected lanes must be a number',
      'number.integer': 'Affected lanes must be an integer',
      'number.min': 'At least 1 lane must be affected',
      'number.max': 'Cannot exceed 10 affected lanes',
    }),

  verificationRequired: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'Verification required flag must be true or false',
    }),
});

/**
 * Incident update validation schema
 * Allows partial updates with at least one field required
 */
const incidentUpdateSchema = Joi.object({
  description: Joi.string()
    .min(10)
    .max(1000)
    .trim()
    .pattern(/^[^<>]*$/)
    .optional()
    .messages({
      'string.min': 'Description must be at least 10 characters',
      'string.max': 'Description cannot exceed 1000 characters',
      'string.pattern.base': 'Description cannot contain HTML tags',
    }),

  severity: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
    .messages({
      'number.base': 'Severity must be a number',
      'number.integer': 'Severity must be an integer',
      'number.min': 'Severity must be between 1 (low) and 5 (critical)',
      'number.max': 'Severity must be between 1 (low) and 5 (critical)',
    }),

  address: Joi.string()
    .max(200)
    .trim()
    .pattern(/^[^<>]*$/)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Address cannot exceed 200 characters',
      'string.pattern.base': 'Address cannot contain HTML tags',
    }),

  estimatedDuration: Joi.number()
    .integer()
    .min(1)
    .max(43200)
    .optional()
    .messages({
      'number.base': 'Estimated duration must be a number',
      'number.integer': 'Estimated duration must be an integer (minutes)',
      'number.min': 'Estimated duration must be at least 1 minute',
      'number.max': 'Estimated duration cannot exceed 30 days',
    }),

  affectedLanes: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .optional()
    .messages({
      'number.base': 'Affected lanes must be a number',
      'number.integer': 'Affected lanes must be an integer',
      'number.min': 'At least 1 lane must be affected',
      'number.max': 'Cannot exceed 10 affected lanes',
    }),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

// ==============================================
// SPATIAL QUERY VALIDATION
// ==============================================

/**
 * Spatial search parameters validation
 * Used for radius-based incident searches
 */
const spatialSearchSchema = Joi.object({
  latitude: Joi.number()
    .min(-90)
    .max(90),
  longitude: Joi.number()
    .min(-180)
    .max(180),
  radius: Joi.number()
    .min(100)
    .max(50000)
    .when('latitude', {
      is: Joi.exist(),
      then: Joi.required().default(5000),
      otherwise: Joi.optional()
    }),
  typeId: Joi.alternatives()
    .try(
      Joi.number().integer().positive(),
      Joi.array().items(Joi.number().integer().positive()).min(1).max(10)
    )
    .optional()
    .messages({
      'alternatives.match': 'Type ID must be a positive integer or array of positive integers',
      'array.min': 'At least one incident type must be specified',
      'array.max': 'Cannot filter by more than 10 incident types at once',
    }),
  severity: Joi.alternatives()
    .try(
      Joi.number().integer().min(1).max(5),
      Joi.array().items(Joi.number().integer().min(1).max(5)).min(1).max(5)
    )
    .optional()
    .messages({
      'alternatives.match': 'Severity must be an integer 1-5 or array of integers 1-5',
      'array.min': 'At least one severity level must be specified',
      'array.max': 'Cannot filter by more than 5 severity levels',
    }),
  verified: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'Verified filter must be true or false',
    }),
  includeExpired: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'Include expired flag must be true or false',
    }),
  page: Joi.number()
    .integer()
    .min(1)
    .max(1000) // Prevent excessive pagination
    .optional()
    .default(1)
    .messages({
      'number.base': 'Page number must be a number',
      'number.integer': 'Page number must be an integer',
      'number.min': 'Page number must be at least 1',
      'number.max': 'Page number cannot exceed 1000',
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100) // Prevent large result sets
    .optional()
    .default(20)
    .messages({
      'number.base': 'Results limit must be a number',
      'number.integer': 'Results limit must be an integer',
      'number.min': 'Results limit must be at least 1',
      'number.max': 'Results limit cannot exceed 100 per page',
    }),
  sortBy: Joi.string()
    .valid('distance', 'created_at', 'severity', 'updated_at')
    .optional()
    .default('distance')
    .messages({
      'any.only': 'Sort field must be one of: distance, created_at, severity, updated_at',
    }),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .default('asc')
    .messages({
      'any.only': 'Sort order must be "asc" or "desc"',
    }),
}).custom((value, helpers) => {
  // Check if any spatial parameters are provided
  const hasLat = value.latitude !== undefined;
  const hasLon = value.longitude !== undefined;
  const hasRadius = value.radius !== undefined;
  
  // Count how many spatial parameters we have
  const spatialParamCount = [hasLat, hasLon, hasRadius].filter(Boolean).length;
  
  // Either all spatial params must be present or none
  if (spatialParamCount > 0 && spatialParamCount < 3) {
    return helpers.error('custom.spatialParams', {
      message: 'Latitude, longitude, and radius must all be provided together for spatial searches'
    });
  }
  
  return value;
});

// ==============================================
// ANALYTICS VALIDATION
// ==============================================

/**
 * Cluster parameters validation
 * Used for K-means clustering of incidents
 */
const clusterParamsSchema = Joi.object({
  bounds: boundsSchema.optional(),

  clusterCount: Joi.number()
    .integer()
    .min(2) // Minimum 2 clusters for meaningful grouping
    .max(50) // Maximum 50 clusters to prevent performance issues
    .optional()
    .default(10)
    .messages({
      'number.base': 'Cluster count must be a number',
      'number.integer': 'Cluster count must be an integer',
      'number.min': 'At least 2 clusters are required for meaningful grouping',
      'number.max': 'Cannot create more than 50 clusters',
    }),

  minSeverity: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .messages({
      'number.base': 'Minimum severity must be a number',
      'number.integer': 'Minimum severity must be an integer',
      'number.min': 'Minimum severity must be at least 1',
      'number.max': 'Minimum severity cannot exceed 5',
    }),

  includeExpired: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'Include expired flag must be true or false',
    }),
});

/**
 * Heatmap parameters validation
 * Used for generating incident density heatmaps
 */
const heatmapParamsSchema = Joi.object({
  bounds: boundsSchema.optional(),

  gridSize: Joi.number()
    .integer()
    .min(10) // Minimum grid size for performance
    .max(200) // Maximum grid size to prevent excessive computation
    .optional()
    .default(50)
    .messages({
      'number.base': 'Grid size must be a number',
      'number.integer': 'Grid size must be an integer',
      'number.min': 'Grid size must be at least 10',
      'number.max': 'Grid size cannot exceed 200',
    }),

  minSeverity: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .messages({
      'number.base': 'Minimum severity must be a number',
      'number.integer': 'Minimum severity must be an integer',
      'number.min': 'Minimum severity must be at least 1',
      'number.max': 'Minimum severity cannot exceed 5',
    }),

  timeRange: Joi.number()
    .integer()
    .min(1)
    .max(168) // 1 week maximum (168 hours)
    .optional()
    .default(24)
    .messages({
      'number.base': 'Time range must be a number',
      'number.integer': 'Time range must be an integer (hours)',
      'number.min': 'Time range must be at least 1 hour',
      'number.max': 'Time range cannot exceed 1 week (168 hours)',
    }),

  includeExpired: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'Include expired flag must be true or false',
    }),
});

// ==============================================
// VALIDATION MIDDLEWARE FUNCTIONS
// ==============================================

/**
 * Create validation middleware from schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Request source (body, query, params)
 * @returns {Function} Express middleware function
 */
const createValidationMiddleware = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false, // Get all validation errors
      stripUnknown: true, // Remove unknown fields
      allowUnknown: false, // Don't allow extra fields
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Please check your input data and try again',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          type: detail.type,
        })),
      });
    }

    // Replace request data with validated/sanitized data
    req[source] = value;
    next();
  };
};

// ==============================================
// EXPORTED MIDDLEWARE FUNCTIONS
// ==============================================

const validateIncidentCreation = createValidationMiddleware(incidentCreationSchema, 'body');
const validateIncidentUpdate = createValidationMiddleware(incidentUpdateSchema, 'body');
const validateSpatialSearch = createValidationMiddleware(spatialSearchSchema, 'query');
const validateClusterParams = createValidationMiddleware(clusterParamsSchema, 'query');
const validateHeatmapParams = createValidationMiddleware(heatmapParamsSchema, 'query');

// ==============================================
// MODULE EXPORTS
// ==============================================

module.exports = {
  // Middleware functions for Express routes
  validateIncidentCreation,
  validateIncidentUpdate,
  validateSpatialSearch,
  validateClusterParams,
  validateHeatmapParams,
  
  // Raw schemas for programmatic validation
  schemas: {
    coordinateSchema,
    boundsSchema,
    incidentCreationSchema,
    incidentUpdateSchema,
    spatialSearchSchema,
    clusterParamsSchema,
    heatmapParamsSchema,
  },
  
  // Utility function for custom validation
  createValidationMiddleware,
};
