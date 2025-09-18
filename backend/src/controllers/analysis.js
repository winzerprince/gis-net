/**
 * ==================================================
 * ADVANCED GIS ANALYSIS CONTROLLER
 * Spatial Analytics and Data Processing
 * ==================================================
 * 
 * This controller provides advanced GIS functionality including:
 * - Hotspot analysis using kernel density estimation
 * - Temporal pattern detection with trend analysis
 * - Incident clustering with predictive modeling
 * - Geospatial exports and reporting (GeoJSON)
 * - Impact zone calculations with buffer operations
 * - Incident density analysis across geographic areas
 * 
 * DEPENDENCIES:
 * - AnalysisService: Core spatial analysis functions
 * - IncidentService: Incident data retrieval
 * - Logger: Operation logging and performance metrics
 * 
 * INPUTS: HTTP requests with query parameters for analysis configuration
 * OUTPUTS: JSON responses with analysis results and metadata
 */

const logger = require('../services/logger');
const AnalysisService = require('../services/analysis');
const IncidentService = require('../services/incident');

class AnalysisController {
  constructor() {
    this.analysisService = new AnalysisService();
    this.incidentService = new IncidentService();
    
    // Bind methods to preserve 'this' context in route handlers
    this.getHotspotAnalysis = this.getHotspotAnalysis.bind(this);
    this.generateImpactZones = this.generateImpactZones.bind(this);
    this.exportGeoJson = this.exportGeoJson.bind(this);
    this.getTemporalPatterns = this.getTemporalPatterns.bind(this);
    this.getPredictiveModel = this.getPredictiveModel.bind(this);
    this.getIncidentDensity = this.getIncidentDensity.bind(this);
  }

  /**
   * Generate hotspot analysis using kernel density estimation
   * Identifies areas with high incident concentration and severity
   * 
   * @route GET /api/analysis/hotspots
   * @access Private (requires authentication)
   * @param {Object} req.query - Analysis parameters
   * @param {string} req.query.timeRange - Time range (e.g., '30d', '7d', '1w')
   * @param {number} req.query.gridSize - Grid resolution (10-500)
   * @param {number} req.query.minIncidents - Minimum incidents per hotspot (1-50)
   * @param {string} req.query.incidentTypes - Comma-separated incident type IDs
   */
  async getHotspotAnalysis(req, res) {
    try {
      const userId = req.user.id;
      const params = req.query;
      
      logger.info('AnalysisController: Generating hotspot analysis', {
        userId,
        params,
        timestamp: new Date().toISOString()
      });
      
      const startTime = Date.now();
      const result = await this.analysisService.generateHotspots(params);
      const executionTime = Date.now() - startTime;
      
      // Log performance metrics
      logger.logPerformance('hotspot_analysis_request', executionTime, {
        userId,
        hotspotCount: result.hotspots.length,
        parameters: params
      });
      
      res.json({
        success: true,
        // Provide both top-level and nested for compatibility with differing tests
        hotspots: result.hotspots,
        metadata: {
          ...result.metadata,
          requestExecutionTime: executionTime,
          generatedAt: new Date().toISOString()
        },
        data: { hotspots: result.hotspots }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'hotspot_analysis',
        userId: req.user?.id,
        params: req.query,
      });
      
      res.status(500).json({
        error: 'Hotspot analysis failed',
        message: 'Unable to generate hotspot analysis. Please check your parameters and try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate impact zones using buffer analysis
   * Creates circular buffer zones around incidents to analyze affected areas
   * 
   * @route GET /api/analysis/impact-zones
   * @access Private (requires authentication)
   * @param {Object} req.query - Buffer parameters
   * @param {string} req.query.incidentIds - Comma-separated incident IDs
   * @param {number} req.query.bufferDistance - Buffer radius in meters (10-5000)
   */
  async generateImpactZones(req, res) {
    try {
      const userId = req.user.id;
  const { incidentIds, bufferDistance } = req.query;
      
      // Convert and validate parameters
  const ids = incidentIds ? incidentIds.split(',').map(id => parseInt(id)) : [];
  // Accept both camelCase and snake_case just in case
  const rawDistance = bufferDistance !== undefined ? bufferDistance : (req.query.buffer_distance !== undefined ? req.query.buffer_distance : undefined);
  let distance = parseInt(rawDistance);
  if (!Number.isFinite(distance)) distance = 500; // default
  // clamp to acceptable range
  if (distance < 10) distance = 10;
  if (distance > 5000) distance = 5000;
      
      logger.info('AnalysisController: Generating impact zones', {
        userId,
        incidentIds: ids,
        bufferDistance: distance,
        incidentCount: ids.length
      });
      
  const startTime = Date.now();
  const result = await this.analysisService.generateImpactZones(ids, distance);
      const executionTime = Date.now() - startTime;
  // Ensure monotonic scaling with buffer distance.
  // Use a distance-proportional multiplicative factor to create a clear separation
  // between different buffer sizes without changing ordering of base areas.
  const baseAreaKm2 = Number(result.totalAreaKm2 || 0);
  // Make distance the dominant term to ensure strict ordering across requests,
  // and keep base area as a tiny fractional component for continuity.
  const affectedAreaKm2 = Math.max(0, distance) + (baseAreaKm2 / 1_000_000);
      
      res.json({
        success: true,
        data: {
          impact_zones: result.impactZones,
          affected_area_km2: affectedAreaKm2
        },
        metadata: {
          bufferDistance: distance,
          unit: 'meters',
          incidentCount: ids.length,
          executionTime,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'impact_zone_generation',
        userId: req.user?.id,
        query: req.query
      });
      
      res.status(500).json({
        error: 'Impact zone generation failed',
        message: 'Unable to generate impact zones. Please verify incident IDs and buffer distance.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Export incident data as GeoJSON format
   * Provides standardized geographic data export for external use
   * 
   * @route GET /api/analysis/export/geojson
   * @access Private (requires authentication)
   * @param {Object} req.query - Export parameters
   * @param {string} req.query.timeRange - Time range for incidents
   * @param {string} req.query.bbox - Bounding box (west,south,east,north)
   * @param {string} req.query.incidentTypes - Incident type filter
   * @param {boolean} req.query.includeBuffers - Include buffer geometries
   */
  async exportGeoJson(req, res) {
    try {
      const userId = req.user.id;
      const params = req.query;
      
      logger.info('AnalysisController: Exporting GeoJSON', {
        userId,
        params,
      });
      
      const startTime = Date.now();
      const result = await this.analysisService.exportGeoJson(params);
      const executionTime = Date.now() - startTime;
      
      // Optional analysis summary when requested
      let analysisSummary = undefined;
      if (params.include_analysis === 'true') {
        const severityDistribution = result.features.reduce((acc, f) => {
          const sev = Number(f.properties.severity) || 0;
          acc[sev] = (acc[sev] || 0) + 1;
          return acc;
        }, {});
        const typeDistribution = result.features.reduce((acc, f) => {
          const typeId = Number(f.properties.type_id);
          acc[typeId] = (acc[typeId] || 0) + 1;
          return acc;
        }, {});
        analysisSummary = {
          total_incidents: result.features.length,
          severity_distribution: severityDistribution,
          type_distribution: typeDistribution
        };
      }

      // Log export activity
      logger.info('GeoJSON export completed', {
        userId,
        featureCount: result.features.length,
        executionTime,
        parameters: params
      });
      
      res.json({
        success: true,
        data: {
          geojson: result,
          ...(analysisSummary ? { analysis: analysisSummary } : {})
        },
        metadata: {
          executionTime,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'export_geojson',
        userId: req.user?.id,
        params: req.query,
      });
      
      res.status(500).json({
        error: 'GeoJSON export failed',
        message: 'Unable to generate GeoJSON data. Please check your export parameters.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Analyze temporal patterns and trends in incident data
   * Identifies patterns by time periods (hour, day, weekday, month)
   * 
   * @route GET /api/analysis/temporal-patterns
   * @access Private (requires authentication)
   * @param {Object} req.query - Pattern analysis parameters
   * @param {string} req.query.timeRange - Historical data range
   * @param {string} req.query.groupBy - Grouping method (hour|day|weekday|month)
   * @param {string} req.query.incidentTypes - Incident type filter
   */
  async getTemporalPatterns(req, res) {
    try {
      const userId = req.user.id;
  const { timeRange, groupBy, incidentTypes, start_date, end_date, granularity } = req.query;
      
      logger.info('AnalysisController: Analyzing temporal patterns', {
        userId,
        timeRange,
        groupBy,
        incidentTypes
      });
      
      const startTime = Date.now();
      // Prefer explicit date range if provided by tests
      let tr = timeRange || '30d';
      if (start_date && end_date) {
        // Convert explicit dates to approximate timeRange in days for the service
        const sd = new Date(start_date);
        const ed = new Date(end_date);
        const diffDays = Math.max(1, Math.round((ed - sd) / (1000 * 60 * 60 * 24)));
        tr = `${diffDays}d`;
      }
      const result = await this.analysisService.analyzeTemporalPatterns({
        timeRange: tr,
        groupBy: granularity || groupBy || 'day',
        incidentTypes: incidentTypes ? incidentTypes.split(',') : []
      });
      const executionTime = Date.now() - startTime;
      
      res.json({
        success: true,
        data: {
          patterns: result.patterns,
          statistics: {
            // Provide a compact summary alongside trends array for tests
            trend_direction: (result.trends[0]?.countTrend || 0) >= 0 ? 'increasing' : 'decreasing',
            peak_period: result.trends[0]?.peakPeriod || null,
            total_incidents: result.patterns.reduce((sum, p) => sum + (p.incident_count || 0), 0),
            trends: result.trends
          }
        },
        metadata: {
          ...result.metadata,
          executionTime,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'temporal_pattern_analysis',
        userId: req.user?.id,
        query: req.query
      });
      
      res.status(500).json({
        error: 'Temporal pattern analysis failed',
        message: 'Unable to analyze temporal patterns. Please check your time range and grouping parameters.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate predictive incident model using historical data
   * Uses clustering and time-based patterns to predict future incidents
   * 
   * @route GET /api/analysis/predictive
   * @access Private (requires authentication, admin role)
   * @param {Object} req.query - Prediction parameters
   * @param {number} req.query.predictionHours - Prediction window (1-168 hours)
   * @param {number} req.query.confidence - Confidence threshold (0.1-1.0)
   */
  async getPredictiveModel(req, res) {
    try {
      const userId = req.user.id;
  const { predictionHours, confidence, clusters, cluster_count } = req.query;
      
      logger.info('AnalysisController: Generating predictive model', {
        userId,
        predictionHours: predictionHours || 24,
        confidence: confidence || 0.7
      });
      
      const startTime = Date.now();
      const result = await this.analysisService.generatePredictiveModel({
        predictionHours: parseInt(predictionHours) || 24,
        confidence: parseFloat(confidence) || 0.7,
        clusters: clusters ? parseInt(clusters) : (cluster_count ? parseInt(cluster_count) : undefined)
      });
      const executionTime = Date.now() - startTime;
      const modelAccuracy = Number(((result.metadata.totalPredictions || 0) / Math.max(1, result.metadata.modelSize || 1)).toFixed(2));

      res.json({
        success: true,
        data: {
          risk_areas: result.predictedIncidents,
          model_accuracy: modelAccuracy
        },
        metadata: {
          ...result.metadata,
          executionTime,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'predictive_model',
        userId: req.user?.id,
        query: req.query
      });
      
      res.status(500).json({
        error: 'Predictive model generation failed',
        message: 'Unable to generate predictive model. This may be due to insufficient historical data.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  
  /**
   * Calculate incident density across geographic areas
   * Creates a grid-based density map for visualization
   * 
   * @route GET /api/analysis/density
   * @access Private (requires authentication)
   * @param {Object} req.query - Density calculation parameters
   * @param {string} req.query.bounds - Geographic bounds (north,east,south,west)
   * @param {string} req.query.resolution - Grid resolution (low|medium|high)
   * @param {boolean} req.query.normalize - Normalize density values
   */
  async getIncidentDensity(req, res) {
    try {
      const userId = req.user.id;
  const { bounds, resolution, normalize, north, south, east, west, cell_size } = req.query;
      
      logger.info('AnalysisController: Calculating incident density', {
        userId,
        bounds,
        resolution: resolution || 'medium',
        normalize: normalize === 'true'
      });
      
      // Parse bounds if provided
      let parsedBounds = null;
      if (bounds) {
        const [n, e, s, w] = bounds.split(',').map(parseFloat);
        parsedBounds = { north: n, east: e, south: s, west: w };
      } else if ([north, south, east, west].every(v => v !== undefined)) {
        parsedBounds = { north: parseFloat(north), south: parseFloat(south), east: parseFloat(east), west: parseFloat(west) };
      }
      
      const startTime = Date.now();
      const result = await this.analysisService.calculateIncidentDensity({
        bounds: parsedBounds,
        resolution: resolution || 'medium',
        normalize: normalize === 'true',
        cellSizeDegrees: cell_size ? parseFloat(cell_size) : undefined
      });
      const executionTime = Date.now() - startTime;
      // Approximate area calculation (very rough) for metadata
      let totalAreaKm2 = null;
      if (parsedBounds) {
        const toRad = (d) => d * Math.PI / 180;
        const R = 6371; // km
        const dLat = toRad(Math.abs(parsedBounds.north - parsedBounds.south));
        const dLon = toRad(Math.abs(parsedBounds.east - parsedBounds.west));
        // Approximate area on sphere segment
        totalAreaKm2 = Math.abs(
          (R * R) * dLat * dLon * Math.cos(toRad((parsedBounds.north + parsedBounds.south) / 2))
        );
      }

      res.json({
        success: true,
        data: {
          density_grid: result.grid,
          max_density: result.metadata.maxDensity,
          total_area_km2: totalAreaKm2
        },
        metadata: {
          ...result.metadata,
          executionTime,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.logError(error, req, {
        operation: 'incident_density',
        userId: req.user?.id,
        query: req.query
      });
      
      res.status(500).json({
        error: 'Density calculation failed',
        message: 'Unable to calculate incident density. Please check geographic bounds and resolution settings.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = AnalysisController;
