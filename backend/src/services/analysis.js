/**
 * ==================================================
 * ADVANCED GIS ANALYSIS SERVICE
 * PostGIS-powered Spatial Analytics Engine
 * ==================================================
 * 
 * This service provides advanced GIS functionality using PostGIS:
 * - Hotspot analysis with kernel density estimation using ST_SnapToGrid
 * - Impact zone calculations with buffer operations using ST_Buffer
 * - Spatial clustering with statistical significance using ST_ClusterKMeans
 * - Temporal pattern detection in spatial data with trend analysis
 * - GeoJSON data exports with proper geometric formatting
 * - Predictive modeling using historical incident clustering
 * - Grid-based density calculations with normalization
 * 
 * DEPENDENCIES:
 * - DatabaseConnection: PostGIS spatial database operations
 * - Logger: Operation logging and performance metrics tracking
 * 
 * INPUTS: Analysis parameters and configuration objects
 * OUTPUTS: Processed spatial analysis results and metadata
 */

const db = require('../db/connection');
const logger = require('./logger');

class AnalysisService {
  constructor() {
    this.db = db;
    
    // Performance tracking
    this.performanceMetrics = {
      hotspotGeneration: [],
      impactZoneGeneration: [],
      temporalAnalysis: [],
      predictiveModeling: [],
      densityCalculation: []
    };
  }

  /**
   * Generate hotspots using kernel density estimation
   * Creates a grid-based analysis of incident concentrations weighted by severity
   * 
   * @param {Object} params - Hotspot generation parameters
   * @param {string} params.timeRange - Time range for analysis (e.g., '30d', '7d')
   * @param {number} params.gridSize - Grid resolution (10-500, higher = finer resolution)
   * @param {number} params.minIncidents - Minimum incidents per hotspot (1-50)
   * @param {number} params.maxPoints - Maximum incidents to analyze (10-2000)
   * @param {string} params.incidentTypes - Comma-separated incident type IDs
   * @returns {Promise<Object>} Hotspot analysis results with metadata
   */
  async generateHotspots(params = {}) {
    try {
      logger.info('AnalysisService: Generating hotspots', { params });
      const startTime = Date.now();
      
      const {
        timeRange = '30d',
        gridSize = 100,
        minIncidents = 3,
        maxPoints = 500,
        incidentTypes,
        north,
        south,
        east,
        west
      } = params;
      
      // Parse and validate time range
      const timeFilterParams = this.parseTimeRange(timeRange);
      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeFilterParams.value} ${timeFilterParams.unit}'`;
      
      // Build incident type filter
      const typeFilter = incidentTypes ? 
        `AND i.type_id IN (${incidentTypes.split(',').map(t => parseInt(t)).join(',')})` : '';
      
            // Build spatial bounds filter if provided
      let boundsFilter = '';
      let boundsParams = [];
      
                              // Robust check for all required bound properties (allow zeros)
      const hasAllBounds = ['north','south','east','west']
        .every(k => params[k] !== undefined && params[k] !== null && params[k] !== '');

      if (hasAllBounds) {
        // Convert to numbers and validate bounds
        const northNum = Number(north);
        const southNum = Number(south);
        const eastNum = Number(east);
        const westNum = Number(west);

        const validNumbers = [northNum, southNum, eastNum, westNum].every(n => Number.isFinite(n));

        if (validNumbers) {
          logger.info('AnalysisService: Applying spatial bounds filter', {
            bounds: { north: northNum, south: southNum, east: eastNum, west: westNum }
          });

          // Use fast bbox intersection with spatial index
          boundsFilter = `AND ST_MakeEnvelope($4, $5, $6, $7, 4326) && i.location`;
          boundsParams = [westNum, southNum, eastNum, northNum];
        } else {
          logger.warn('AnalysisService: Invalid spatial bounds provided, skipping bounds filter', {
            bounds: { north, south, east, west }
          });
        }
      } else {
        logger.info('AnalysisService: Not all spatial bounds provided, querying all incidents');
      }
      
      // Complex hotspot analysis query using PostGIS functions
      const query = `
        WITH incident_points AS (
          -- Select relevant incidents within time and type constraints
          SELECT 
            i.id,
            i.location,
            i.severity,
            i.created_at,
            i.type_id,
            it.name AS incident_type
          FROM incidents i
          JOIN incident_types it ON i.type_id = it.id
          WHERE 
            i.status = 'active'
            ${timeFilter}
            ${typeFilter}
            ${boundsFilter}
          ORDER BY i.created_at DESC
          LIMIT $1
        ),
        grid_cells AS (
          -- Create grid cells and aggregate incidents
          SELECT
            ST_SnapToGrid(location, $2) AS cell,
            COUNT(*) AS incident_count,
            AVG(severity) AS avg_severity,
            SUM(severity) AS total_severity,
            array_agg(id) AS incident_ids,
            array_agg(DISTINCT incident_type) AS incident_types
          FROM incident_points
          GROUP BY cell
          HAVING COUNT(*) >= $3
        ),
        hotspot_calculation AS (
          -- Calculate hotspot scores and statistics
          SELECT
            ST_X(ST_Centroid(cell)) AS longitude,
            ST_Y(ST_Centroid(cell)) AS latitude,
            incident_count,
            avg_severity,
            total_severity,
            incident_count * avg_severity AS hotspot_score,
            incident_ids,
            incident_types,
            -- Calculate statistical significance
            CASE 
              WHEN incident_count >= 10 THEN 'high'
              WHEN incident_count >= 5 THEN 'medium'
              ELSE 'low'
            END AS significance_level
          FROM grid_cells
        )
        SELECT
          longitude,
          latitude,
          incident_count,
          avg_severity::numeric(10,2) AS avg_severity,
          total_severity,
          hotspot_score::numeric(10,2) AS hotspot_score,
          incident_ids,
          incident_types,
          significance_level,
          -- Normalized score (0-1) for visualization
          CASE 
            WHEN (SELECT MAX(hotspot_score) FROM hotspot_calculation) > 0 
            THEN (hotspot_score / (SELECT MAX(hotspot_score) FROM hotspot_calculation))::numeric(10,2)
            ELSE 0
          END AS normalized_score,
          -- Risk level categorization
          CASE 
            WHEN hotspot_score >= (SELECT AVG(hotspot_score) + STDDEV(hotspot_score) FROM hotspot_calculation) THEN 'critical'
            WHEN hotspot_score >= (SELECT AVG(hotspot_score) FROM hotspot_calculation) THEN 'high'
            ELSE 'moderate'
          END AS risk_level
        FROM hotspot_calculation
        ORDER BY hotspot_score DESC
      `;
      
      const gridResolution = 1.0 / gridSize; // Convert grid size to degrees
      const queryParams = [maxPoints, gridResolution, minIncidents, ...boundsParams];
      const result = await this.db.query(query, queryParams);
      
      // Transform and enrich the results
      const hotspots = result.rows.map(row => ({
        longitude: parseFloat(row.longitude),
        latitude: parseFloat(row.latitude),
        incidentCount: parseInt(row.incident_count),
        avgSeverity: parseFloat(row.avg_severity),
        totalSeverity: parseInt(row.total_severity),
        hotspotScore: parseFloat(row.hotspot_score),
        normalizedScore: parseFloat(row.normalized_score),
        riskLevel: row.risk_level,
        significanceLevel: row.significance_level,
        incidentIds: row.incident_ids,
        incidentTypes: row.incident_types
      }));
      
      const executionTime = Date.now() - startTime;
      
      // Track performance metrics
      this.performanceMetrics.hotspotGeneration.push({
        timestamp: new Date(),
        executionTime,
        hotspotCount: hotspots.length,
        gridSize,
        timeRange
      });
      
      logger.logPerformance('hotspot_generation', executionTime, {
        hotspotCount: hotspots.length,
        timeRange,
        gridSize,
        minIncidents
      });
      
      return {
        hotspots,
        metadata: {
          timeRange: timeFilterParams,
          gridSize,
          gridResolution,
          minIncidents,
          totalHotspots: hotspots.length,
          executionTime,
          maxScore: hotspots.length > 0 ? hotspots[0].hotspotScore : 0,
          analysisDate: new Date().toISOString()
        }
      };
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'generate_hotspots',
        params
      });
      throw error;
    }
  }

  /**
   * Generate impact zones using buffer analysis
   * Creates circular buffer zones around incidents to analyze spatial impact
   * 
   * @param {Array<number>} incidentIds - Incident IDs to analyze
   * @param {number} bufferDistance - Buffer distance in meters (10-5000)
   * @returns {Promise<Object>} Impact zone analysis with overlaps and statistics
   */
  async generateImpactZones(incidentIds, bufferDistance = 500) {
    try {
      logger.info('AnalysisService: Generating impact zones', { 
        incidentCount: incidentIds.length,
        bufferDistance
      });
      
      const startTime = Date.now();
      
      // Build query parameters - if no specific incidents, use recent active incidents
      let idFilter = '';
      let params = [bufferDistance];
      
      if (incidentIds && incidentIds.length > 0) {
        idFilter = 'AND i.id = ANY($2)';
        params.push(incidentIds);
      } else {
        // Use recent active incidents if no specific IDs provided
        idFilter = 'AND i.created_at >= NOW() - INTERVAL \'24 hours\'';
      }
      
      // Complex buffer analysis with overlap detection
      const query = `
        WITH incident_buffers AS (
          -- Create buffer geometries for each incident
          SELECT
            i.id,
            i.type_id,
            i.severity,
            i.description,
            i.location,
            i.created_at,
            ST_Buffer(i.location::geography, $1)::geometry AS buffer_geom,
            -- keep area in m2 for per-incident detail
            ST_Area(ST_Buffer(i.location::geography, $1)) AS buffer_area_m2,
            it.name AS incident_type,
            it.color,
            it.priority AS priority_level
          FROM incidents i
          JOIN incident_types it ON i.type_id = it.id
          WHERE i.status = 'active'
          ${idFilter}
        ),
        buffer_statistics AS (
          -- Calculate overall buffer statistics
          SELECT 
            COUNT(*) AS total_buffers,
            SUM(buffer_area_m2) AS total_area_m2,
            AVG(buffer_area_m2) AS avg_area_m2,
            ST_Union(buffer_geom) AS merged_geometry
          FROM incident_buffers
        ),
        overlap_analysis AS (
          -- Analyze buffer overlaps for each incident
          SELECT
            ib1.id,
            ib1.description,
            ib1.incident_type,
            ib1.color,
            ib1.severity,
            ib1.priority_level,
            ib1.created_at,
            ST_AsGeoJSON(ib1.location) AS location_geojson,
            ST_AsGeoJSON(ib1.buffer_geom) AS buffer_geojson,
            ib1.buffer_area_m2,
            -- Count overlapping buffers
            (SELECT COUNT(*) FROM incident_buffers ib2 
             WHERE ib1.id != ib2.id AND ST_Intersects(ib1.buffer_geom, ib2.buffer_geom)) AS overlap_count,
            -- Calculate overlap area
            COALESCE((
              SELECT SUM(ST_Area(ST_Intersection(ib1.buffer_geom, ib2.buffer_geom)))
              FROM incident_buffers ib2 
              WHERE ib1.id != ib2.id AND ST_Intersects(ib1.buffer_geom, ib2.buffer_geom)
            ), 0) AS overlap_area_m2,
            -- Identify overlapping incident IDs
            ARRAY(
              SELECT ib2.id FROM incident_buffers ib2 
              WHERE ib1.id != ib2.id AND ST_Intersects(ib1.buffer_geom, ib2.buffer_geom)
            ) AS overlapping_incidents
          FROM incident_buffers ib1
        )
        SELECT
          oa.*,
          bs.total_buffers,
          bs.total_area_m2,
          bs.avg_area_m2,
          -- Risk assessment based on overlaps and severity
          CASE 
            WHEN oa.overlap_count >= 3 AND oa.severity >= 4 THEN 'critical'
            WHEN oa.overlap_count >= 2 OR oa.severity >= 4 THEN 'high'
            WHEN oa.overlap_count >= 1 OR oa.severity >= 3 THEN 'medium'
            ELSE 'low'
          END AS impact_risk_level
        FROM overlap_analysis oa, buffer_statistics bs
        ORDER BY oa.overlap_count DESC, oa.severity DESC
      `;
      
      const result = await this.db.query(query, params);
      
      // Transform results to structured format
    const impactZones = result.rows.map(row => {
        const location = JSON.parse(row.location_geojson);
        const buffer = JSON.parse(row.buffer_geojson);
        
        return {
      // Fields expected by tests (snake_case)
      incident_id: row.id,
      center_lat: location.coordinates[1],
      center_lon: location.coordinates[0],
      buffer_geometry: buffer,
      severity: parseInt(row.severity),
      area_m2: parseFloat(row.buffer_area_m2),
      // Additional context retained but not required by tests
      description: row.description,
      incident_type: row.incident_type,
      color: row.color,
      priority_level: row.priority_level,
      created_at: row.created_at,
      overlap_count: parseInt(row.overlap_count),
      overlap_area_m2: parseFloat(row.overlap_area_m2),
      overlapping_incidents: row.overlapping_incidents || [],
      impact_risk_level: row.impact_risk_level
        };
      });
      
      const executionTime = Date.now() - startTime;
    const totalAreaKm2 = result.rows.length > 0 ? (parseFloat(result.rows[0].total_area_m2) / 1_000_000) : 0;
      
      // Track performance
      this.performanceMetrics.impactZoneGeneration.push({
        timestamp: new Date(),
        executionTime,
        zoneCount: impactZones.length,
        bufferDistance
      });
      
      return {
        impactZones,
        totalAreaKm2,
        metadata: {
          bufferDistance,
          totalZones: impactZones.length,
          executionTime,
          analysisDate: new Date().toISOString()
        }
      };
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'generate_impact_zones',
        incidentIds,
        bufferDistance
      });
      throw error;
    }
  }

  /**
   * Export incident data as GeoJSON format
   * Creates standardized geographic data exports for external applications
   * 
   * @param {Object} params - Export configuration parameters
   * @param {string} params.timeRange - Time range for incidents
   * @param {string} params.bbox - Bounding box filter (west,south,east,north)
   * @param {string} params.incidentTypes - Incident type filter
   * @param {boolean} params.includeBuffers - Include buffer geometries
   * @param {number} params.bufferDistance - Buffer distance for geometries
   * @param {number} params.maxIncidents - Maximum incidents to export
   * @returns {Promise<Object>} GeoJSON FeatureCollection with metadata
   */
  async exportGeoJson(params = {}) {
    try {
      logger.info('AnalysisService: Exporting GeoJSON', { params });
      
      const startTime = Date.now();
      const {
        timeRange = '30d',
        bbox,
        incidentTypes,
        includeBuffers = false,
        bufferDistance = 500,
        maxIncidents = 1000
      } = params;
      
      // Parse time range constraint
      const timeFilterParams = this.parseTimeRange(timeRange);
      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeFilterParams.value} ${timeFilterParams.unit}'`;
      
      // Build spatial bounding box filter
      let bboxFilter = '';
      let bboxString = bbox;
      // Accept individual edges if provided (controller passes raw req.query)
      if (!bboxString && ['north','south','east','west'].every(k => params[k] !== undefined)) {
        bboxString = `${params.west},${params.south},${params.east},${params.north}`;
      }
      if (bboxString) {
        const [west, south, east, north] = bboxString.split(',').map(parseFloat);
        if ([west, south, east, north].every(Number.isFinite)) {
          bboxFilter = `AND ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326) && i.location`;
        }
      }
      
      // Build incident type filter
      const typeFilter = incidentTypes ? 
        `AND i.type_id IN (${incidentTypes.split(',').map(t => Number.parseInt(t, 10)).filter(n => Number.isFinite(n)).join(',')})` : '';
      
      // Optional buffer geometry selection
      const bufferSelect = includeBuffers === 'true' ?
        `, ST_AsGeoJSON(ST_Buffer(i.location::geography, ${bufferDistance})::geometry) AS buffer_geojson` : '';
      
    // Main export query with comprehensive incident data
      const query = `
        SELECT
          i.id,
          i.type_id,
          i.description,
          i.severity,
          i.verified,
          i.status,
          i.created_at,
          i.updated_at,
          ST_AsGeoJSON(i.location) AS location_geojson,
          ST_X(i.location) AS longitude,
          ST_Y(i.location) AS latitude,
          it.name AS incident_type,
          it.color,
          it.icon,
      it.priority AS priority_level,
          u.username AS reported_by,
          u.id AS reporter_id
          ${bufferSelect}
        FROM incidents i
        JOIN incident_types it ON i.type_id = it.id
        JOIN users u ON i.reported_by = u.id
        WHERE i.status = 'active'
        ${timeFilter}
        ${bboxFilter}
        ${typeFilter}
        ORDER BY i.created_at DESC
        LIMIT $1
      `;
      
      const result = await this.db.query(query, [maxIncidents]);
      
      // Build GeoJSON feature collection
  const features = result.rows.map(row => {
        const feature = {
          type: 'Feature',
          geometry: JSON.parse(row.location_geojson),
          properties: {
            id: row.id,
            description: row.description,
    // Provide both snake_case and camelCase for compatibility
    incident_type: row.incident_type,
    incidentType: row.incident_type,
    type_id: row.type_id,
    typeId: row.type_id,
            severity: row.severity,
            verified: row.verified,
            status: row.status,
    reported_by: row.reported_by,
    reportedBy: row.reported_by,
    reporter_id: row.reporter_id,
    reporterId: row.reporter_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            color: row.color,
            icon: row.icon,
    priority_level: row.priority_level,
    priorityLevel: row.priority_level,
            longitude: parseFloat(row.longitude),
            latitude: parseFloat(row.latitude)
          }
        };
        
        // Add buffer geometry if requested
        if (includeBuffers === 'true' && row.buffer_geojson) {
          feature.properties.buffer = JSON.parse(row.buffer_geojson);
          feature.properties.bufferDistance = bufferDistance;
        }
        
        return feature;
      });
      
      const executionTime = Date.now() - startTime;
      
      // Create complete GeoJSON response
      const geoJsonExport = {
        type: 'FeatureCollection',
        features,
        metadata: {
          count: features.length,
          timeRange: timeFilterParams,
          exportDate: new Date().toISOString(),
          includesBuffers: includeBuffers === 'true',
          bufferDistance: includeBuffers === 'true' ? bufferDistance : null,
          executionTime,
          bbox: bboxString || null,
          filters: {
            incidentTypes: incidentTypes || null,
            maxIncidents
          }
        },
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
          }
        }
      };
      
      logger.info('GeoJSON export completed', {
        featureCount: features.length,
        executionTime,
        includeBuffers: includeBuffers === 'true'
      });
      
      return geoJsonExport;
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'export_geojson',
        params
      });
      throw error;
    }
  }

  /**
   * Analyze temporal patterns in incident data
   * Identifies patterns and trends across different time periods
   * 
   * @param {Object} params - Temporal analysis parameters
   * @param {string} params.timeRange - Historical data range
   * @param {string} params.groupBy - Time grouping (hour|day|weekday|month)
   * @param {Array} params.incidentTypes - Incident type filter array
   * @returns {Promise<Object>} Temporal patterns with trend analysis
   */
  async analyzeTemporalPatterns(params = {}) {
    try {
      logger.info('AnalysisService: Analyzing temporal patterns', { params });
      
      const startTime = Date.now();
      const {
        timeRange = '30d',
        groupBy = 'day',
        incidentTypes = []
      } = params;
      
      // Parse time range for filtering
      const timeFilterParams = this.parseTimeRange(timeRange);
      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeFilterParams.value} ${timeFilterParams.unit}'`;
      
      // Build type filter
      const typeFilter = incidentTypes.length > 0 ?
        `AND i.type_id IN (${incidentTypes.map(t => parseInt(t)).join(',')})` : '';
      
      // Dynamic time grouping function based on groupBy parameter
      let groupingFunction;
      let orderClause;
      
      switch(groupBy) {
        case 'hour':
          groupingFunction = `DATE_TRUNC('hour', i.created_at)`;
          orderClause = 'time_group';
          break;
        case 'weekday':
          groupingFunction = `EXTRACT(DOW FROM i.created_at)`;
          orderClause = 'time_group';
          break;
        case 'month':
          groupingFunction = `DATE_TRUNC('month', i.created_at)`;
          orderClause = 'time_group';
          break;
        default: // day
          groupingFunction = `DATE_TRUNC('day', i.created_at)`;
          orderClause = 'time_group';
      }
      
      // Advanced temporal analysis query with group-specific SQL to avoid type mismatches
      const query = (groupBy === 'weekday') ? `
        WITH temporal_data AS (
          SELECT
            EXTRACT(DOW FROM i.created_at) AS time_group,
            COUNT(*) AS incident_count,
            AVG(i.severity) AS avg_severity,
            STDDEV(i.severity) AS severity_stddev,
            MIN(i.severity) AS min_severity,
            MAX(i.severity) AS max_severity,
            it.name AS incident_type,
            it.id AS type_id,
            it.color,
            ARRAY_AGG(EXTRACT(HOUR FROM i.created_at)) AS hour_distribution
          FROM incidents i
          JOIN incident_types it ON i.type_id = it.id
          WHERE i.status = 'active'
          ${timeFilter}
          ${typeFilter}
          GROUP BY time_group, it.name, it.id, it.color
          ORDER BY time_group
        )
        SELECT
          CASE 
            WHEN time_group = 0 THEN 'Sunday'
            WHEN time_group = 1 THEN 'Monday'
            WHEN time_group = 2 THEN 'Tuesday'
            WHEN time_group = 3 THEN 'Wednesday'
            WHEN time_group = 4 THEN 'Thursday'
            WHEN time_group = 5 THEN 'Friday'
            WHEN time_group = 6 THEN 'Saturday'
          END AS time_period,
          incident_count,
          avg_severity::numeric(10,2) AS avg_severity,
          COALESCE(severity_stddev::numeric(10,2), 0) AS severity_stddev,
          min_severity,
          max_severity,
          incident_type,
          type_id,
          color,
          hour_distribution,
          incident_count::float / SUM(incident_count) OVER (PARTITION BY incident_type) AS relative_frequency
        FROM temporal_data
        ORDER BY time_group, incident_type
      ` : `
        WITH temporal_data AS (
          SELECT
            ${groupingFunction} AS time_group,
            COUNT(*) AS incident_count,
            AVG(i.severity) AS avg_severity,
            STDDEV(i.severity) AS severity_stddev,
            MIN(i.severity) AS min_severity,
            MAX(i.severity) AS max_severity,
            it.name AS incident_type,
            it.id AS type_id,
            it.color,
            ARRAY_AGG(EXTRACT(HOUR FROM i.created_at)) AS hour_distribution
          FROM incidents i
          JOIN incident_types it ON i.type_id = it.id
          WHERE i.status = 'active'
          ${timeFilter}
          ${typeFilter}
          GROUP BY time_group, it.name, it.id, it.color
          ORDER BY ${orderClause}
        )
        SELECT
          time_group::text AS time_period,
          incident_count,
          avg_severity::numeric(10,2) AS avg_severity,
          COALESCE(severity_stddev::numeric(10,2), 0) AS severity_stddev,
          min_severity,
          max_severity,
          incident_type,
          type_id,
          color,
          hour_distribution,
          incident_count::float / SUM(incident_count) OVER (PARTITION BY incident_type) AS relative_frequency
        FROM temporal_data
        ORDER BY time_group, incident_type
      `;
      
      const result = await this.db.query(query);
      
      // Process and enhance the temporal patterns
  const patterns = this.processTemporalPatterns(result.rows, groupBy);
      
      // Calculate comprehensive trends
      const trends = this.calculateAdvancedTrends(patterns, groupBy);
      
      const executionTime = Date.now() - startTime;
      
      // Track performance metrics
      this.performanceMetrics.temporalAnalysis.push({
        timestamp: new Date(),
        executionTime,
        patternCount: patterns.length,
        groupBy,
        timeRange
      });
      
      return {
        patterns,
        trends,
        metadata: {
          timeRange: timeFilterParams,
          groupBy,
          incidentTypes,
          totalPatterns: patterns.length,
          executionTime,
          analysisDate: new Date().toISOString()
        }
      };
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'analyze_temporal_patterns',
        params
      });
      throw error;
    }
  }

  /**
   * Generate predictive model for future incidents
   * Uses historical clustering and temporal patterns for prediction
   * 
   * @param {Object} params - Prediction model parameters
   * @param {number} params.predictionHours - Prediction time window (1-168)
   * @param {number} params.confidence - Confidence threshold (0.1-1.0)
   * @param {number} params.minDataPoints - Minimum historical data points (default: 50)
   * @returns {Promise<Object>} Predictive model with confidence scores
   */
  async generatePredictiveModel(params = {}) {
    try {
      logger.info('AnalysisService: Generating predictive model', { params });
      
      const startTime = Date.now();
      const {
        predictionHours = 24,
        confidence = 0.7,
        minDataPoints = 50,
        clusters
      } = params;

      let kClusters = 10;
      if (clusters !== undefined) {
        const c = Number.parseInt(clusters, 10);
        if (!Number.isFinite(c) || c < 1 || c > 50) {
          const err = new Error('validation: clusters must be between 1 and 50');
          err.name = 'ValidationError';
          throw err;
        }
        kClusters = c;
      }
      
      // Check data sufficiency for reliable predictions
      const countQuery = `
        SELECT COUNT(*) AS incident_count
        FROM incidents
        WHERE status = 'active'
        AND created_at >= NOW() - INTERVAL '30 days'
      `;
      
      const countResult = await this.db.query(countQuery);
      const incidentCount = parseInt(countResult.rows[0].incident_count);
      
      if (incidentCount < minDataPoints) {
        return {
          model: [],
          predictedIncidents: [],
          metadata: {
            error: 'Insufficient data',
            message: `Need at least ${minDataPoints} incidents in last 30 days, only have ${incidentCount}`,
            incidentCount,
            predictionHours,
            confidence,
            dataStatus: 'insufficient'
          }
        };
      }
      
      // Advanced predictive model using spatial clustering and temporal patterns
      const query = `
        WITH historical_patterns AS (
          SELECT
            i.type_id,
            it.name AS incident_type,
            it.color,
            -- Spatial clustering using K-means
            ST_ClusterKMeans(i.location, ${'${kClusters}'} ) OVER (PARTITION BY i.type_id) AS spatial_cluster,
            -- Temporal patterns
            EXTRACT(HOUR FROM i.created_at) AS hour_of_day,
            EXTRACT(DOW FROM i.created_at) AS day_of_week,
            EXTRACT(DAY FROM i.created_at) AS day_of_month,
            DATE_PART('week', i.created_at) AS week_of_year,
            i.location,
            i.severity,
            i.created_at
          FROM incidents i
          JOIN incident_types it ON i.type_id = it.id
          WHERE i.status = 'active'
          AND i.created_at >= NOW() - INTERVAL '90 days'
        ),
        cluster_analysis AS (
          SELECT
            type_id,
            incident_type,
            color,
            spatial_cluster,
            -- Spatial center of cluster
            ST_Centroid(ST_Collect(location)) AS cluster_center,
            -- Statistical measures
            COUNT(*) AS incident_count,
            AVG(severity) AS avg_severity,
            STDDEV(severity) AS severity_variance,
            -- Temporal patterns within cluster
            array_agg(DISTINCT hour_of_day ORDER BY hour_of_day) AS active_hours,
            array_agg(DISTINCT day_of_week ORDER BY day_of_week) AS active_days,
            -- Recent activity indicator
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS recent_incidents
          FROM historical_patterns
          GROUP BY type_id, incident_type, color, spatial_cluster
          HAVING COUNT(*) >= 3  -- Require minimum cluster size
        ),
        prediction_scoring AS (
          SELECT
            ca.type_id,
            ca.incident_type,
            ca.color,
            ca.spatial_cluster,
            ca.incident_count,
            ca.avg_severity,
            -- Location coordinates
            ST_X(ca.cluster_center) AS longitude,
            ST_Y(ca.cluster_center) AS latitude,
            -- Base frequency score
            ca.incident_count::float / (SELECT SUM(incident_count) FROM cluster_analysis) AS base_frequency,
            -- Recent activity boost
            CASE 
              WHEN ca.recent_incidents > 0 THEN 1.5
              ELSE 1.0
            END AS recent_activity_multiplier,
            -- Current time context scoring
            CASE 
              WHEN EXTRACT(HOUR FROM NOW()) = ANY(ca.active_hours) THEN 2.0
              ELSE 0.5
            END AS hour_match_score,
            CASE 
              WHEN EXTRACT(DOW FROM NOW()) = ANY(ca.active_days) THEN 2.0
              ELSE 0.5
            END AS day_match_score,
            ca.active_hours,
            ca.active_days,
            ca.severity_variance
          FROM cluster_analysis ca
        )
        SELECT
          type_id,
          incident_type,
          color,
          longitude,
          latitude,
          incident_count,
          avg_severity::numeric(10,2) AS avg_severity,
          base_frequency::numeric(10,4) AS base_frequency,
          -- Composite prediction score
          (base_frequency * recent_activity_multiplier * 
           (hour_match_score + day_match_score) / 2)::numeric(10,4) AS prediction_score,
          -- Confidence indicators
          CASE 
            WHEN incident_count >= 20 THEN 'high'
            WHEN incident_count >= 10 THEN 'medium'
            ELSE 'low'
          END AS data_confidence,
          active_hours,
          active_days,
          COALESCE(severity_variance::numeric(10,2), 0) AS severity_variance
        FROM prediction_scoring
        WHERE base_frequency >= $1
        ORDER BY prediction_score DESC
        LIMIT 50
      `;
      
      const result = await this.db.query(query, [confidence / 20]);
      
      // Transform results into structured predictions
      const predictiveModel = result.rows.map(row => ({
        typeId: row.type_id,
        incidentType: row.incident_type,
        color: row.color,
        location: {
          longitude: parseFloat(row.longitude),
          latitude: parseFloat(row.latitude)
        },
        avgSeverity: parseFloat(row.avg_severity),
        incidentCount: parseInt(row.incident_count),
        baseFrequency: parseFloat(row.base_frequency),
        predictionScore: parseFloat(row.prediction_score),
        dataConfidence: row.data_confidence,
        severityVariance: parseFloat(row.severity_variance),
        activeHours: row.active_hours,
        activeDays: row.active_days
      }));
      
      // Filter high-confidence predictions
      const predictedIncidents = predictiveModel
        .filter(model => model.predictionScore >= confidence)
        .slice(0, 20) // Limit to top 20 predictions
        .map((model, index) => ({
          id: `prediction-${Date.now()}-${index}`,
          typeId: model.typeId,
          incidentType: model.incidentType,
          color: model.color,
          location: model.location,
          predictedSeverity: model.avgSeverity,
          confidenceScore: model.predictionScore,
          dataConfidence: model.dataConfidence,
          predictedTimeframe: `Next ${predictionHours} hours`,
          riskFactors: {
            historicalFrequency: model.baseFrequency,
            severityVariance: model.severityVariance,
            temporalAlignment: model.activeHours.includes(new Date().getHours())
          }
        }));
      
      const executionTime = Date.now() - startTime;
      
      // Track performance
      this.performanceMetrics.predictiveModeling.push({
        timestamp: new Date(),
        executionTime,
        modelSize: predictiveModel.length,
        predictionCount: predictedIncidents.length
      });
      
      return {
        model: predictiveModel,
        predictedIncidents,
        metadata: {
          predictionHours,
          confidence,
          totalPredictions: predictedIncidents.length,
          modelSize: predictiveModel.length,
          dataPointsUsed: incidentCount,
          executionTime,
          generatedAt: new Date().toISOString(),
          dataStatus: 'sufficient'
        }
      };
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'generate_predictive_model',
        params
      });
      throw error;
    }
  }
  
  /**
   * Calculate incident density across geographic areas
   * Creates grid-based density visualization data
   * 
   * @param {Object} params - Density calculation parameters
   * @param {Object} params.bounds - Geographic bounds {north, east, south, west}
   * @param {string} params.resolution - Grid resolution (low|medium|high)
   * @param {boolean} params.normalize - Normalize density values (0-1)
   * @param {string} params.timeRange - Time range for analysis
   * @returns {Promise<Object>} Density grid with metadata
   */
  async calculateIncidentDensity(params = {}) {
    try {
      logger.info('AnalysisService: Calculating incident density', { params });
      
      const startTime = Date.now();
      const {
        bounds,
        resolution = 'medium',
        normalize = false,
        timeRange = '30d',
        cellSizeDegrees
      } = params;
      
      // Convert resolution to appropriate grid size
  let gridSize;
      switch(resolution) {
        case 'high':
          gridSize = 200;   // Fine resolution for detailed analysis
          break;
        case 'low':
          gridSize = 50;    // Coarse resolution for overview
          break;
        default: // medium
          gridSize = 100;   // Balanced resolution
      }
      
      // Parse time constraints
      const timeFilterParams = this.parseTimeRange(timeRange);
      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeFilterParams.value} ${timeFilterParams.unit}'`;
      
      // Build geographic bounds constraint
      let boundsFilter = '';
      let boundsParams = [];
      
      if (bounds) {
        boundsFilter = `AND ST_Within(
          i.location, 
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )`;
        boundsParams = [bounds.west, bounds.south, bounds.east, bounds.north];
      }
      
      // Advanced density calculation with statistical measures
      const query = `
        WITH incident_grid AS (
          SELECT
            ST_SnapToGrid(i.location, $${boundsParams.length + 1}) AS grid_cell,
            COUNT(*) AS incident_count,
            AVG(i.severity) AS avg_severity,
            STDDEV(i.severity) AS severity_stddev,
            SUM(i.severity) AS total_severity,
            array_agg(i.type_id) AS type_distribution,
            array_agg(EXTRACT(HOUR FROM i.created_at)) AS hour_distribution,
            MIN(i.created_at) AS earliest_incident,
            MAX(i.created_at) AS latest_incident
          FROM incidents i
          WHERE i.status = 'active'
          ${timeFilter}
          ${boundsFilter}
          GROUP BY grid_cell
        ),
        density_statistics AS (
          SELECT
            MAX(incident_count) AS max_count,
            AVG(incident_count) AS avg_count,
            STDDEV(incident_count) AS count_stddev,
            MAX(total_severity) AS max_severity_sum,
            AVG(avg_severity) AS overall_avg_severity
          FROM incident_grid
        )
        SELECT
          ST_X(ST_Centroid(ig.grid_cell)) AS longitude,
          ST_Y(ST_Centroid(ig.grid_cell)) AS latitude,
          ig.incident_count,
          ig.avg_severity::numeric(10,2) AS avg_severity,
          COALESCE(ig.severity_stddev::numeric(10,2), 0) AS severity_stddev,
          ig.total_severity,
          -- Weighted density score combining count and severity
          (ig.incident_count * ig.avg_severity)::numeric(10,2) AS density_score,
          -- Statistical significance indicators
          CASE 
            WHEN ig.incident_count >= (ds.avg_count + ds.count_stddev) THEN 'high'
            WHEN ig.incident_count >= ds.avg_count THEN 'medium'
            ELSE 'low'
          END AS density_significance,
          -- Type diversity in cell
          array_length(array(SELECT DISTINCT unnest(ig.type_distribution)), 1) AS type_diversity,
          ig.type_distribution,
          ig.hour_distribution,
          ig.earliest_incident,
          ig.latest_incident,
          -- Temporal activity span
          EXTRACT(EPOCH FROM (ig.latest_incident - ig.earliest_incident))/3600 AS activity_span_hours,
          ds.max_count,
          ds.max_severity_sum
        FROM incident_grid ig, density_statistics ds
        ORDER BY density_score DESC
      `;
      
  const gridResolution = cellSizeDegrees ? cellSizeDegrees : (1.0 / gridSize); // Convert to degrees or override
      const queryParams = [...boundsParams, gridResolution];
      
      const result = await this.db.query(query, queryParams);
      
      // Process and normalize results
      let maxDensity = 1;
      if (result.rows.length > 0 && normalize) {
        maxDensity = Math.max(...result.rows.map(row => parseFloat(row.density_score)));
      }
      
      const densityGrid = result.rows.map(row => {
        const longitude = parseFloat(row.longitude);
        const latitude = parseFloat(row.latitude);
        const incidentCount = parseInt(row.incident_count);
        const avgSeverity = parseFloat(row.avg_severity);
        const severityStdDev = parseFloat(row.severity_stddev);
        const densityScore = parseFloat(row.density_score);
        // Estimate km per degree at this latitude for rough density per km^2
        const latKm = 111.32; // approx km per degree latitude
        const lonKm = 111.32 * Math.cos(latitude * Math.PI / 180);
        const cellAreaKm2 = (gridResolution * latKm) * (gridResolution * lonKm);
        const densityPerKm2 = cellAreaKm2 > 0 ? incidentCount / cellAreaKm2 : null;
        return {
          // Expected fields by tests
          grid_x: longitude, // using center coords as grid identifiers
          grid_y: latitude,
          incident_count: incidentCount,
          density_per_km2: densityPerKm2,
          center_lat: latitude,
          center_lon: longitude,
          // Keep existing enriched fields
          longitude,
          latitude,
          incidentCount,
          avgSeverity,
          severityStdDev,
          densityScore,
          normalizedDensity: normalize ? densityScore / maxDensity : null,
          densitySignificance: row.density_significance,
          typeDiversity: parseInt(row.type_diversity) || 0,
          typeDistribution: row.type_distribution,
          hourDistribution: row.hour_distribution,
          activitySpanHours: parseFloat(row.activity_span_hours) || 0,
          earliestIncident: row.earliest_incident,
          latestIncident: row.latest_incident
        };
      });
      
      const executionTime = Date.now() - startTime;
      
      // Track performance metrics
      this.performanceMetrics.densityCalculation.push({
        timestamp: new Date(),
        executionTime,
        cellCount: densityGrid.length,
        resolution,
        gridSize
      });
      
      return {
        grid: densityGrid,
        metadata: {
          resolution,
          gridSize,
          gridResolution,
          cellCount: densityGrid.length,
          maxDensity,
          normalized: normalize,
          timeRange: timeFilterParams,
          bounds: bounds || null,
          executionTime,
          analysisDate: new Date().toISOString()
        }
      };
      
    } catch (error) {
      logger.logError(error, null, {
        operation: 'calculate_incident_density',
        params
      });
      throw error;
    }
  }

  // UTILITY METHODS

  /**
   * Process temporal pattern results for consistency
   * Ensures all time periods are represented with proper formatting
   * @private
   */
  processTemporalPatterns(rows, groupBy) {
    if (groupBy === 'weekday') {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const incidentTypes = [...new Set(rows.map(row => row.incident_type))];
      
      const result = [];
      for (const weekday of weekdays) {
        for (const type of incidentTypes) {
          const match = rows.find(row => row.time_period === weekday && row.incident_type === type);
          if (match) {
            result.push({
              ...match,
              period: match.time_period,
              incident_count: parseInt(match.incident_count),
              avg_severity: parseFloat(match.avg_severity),
              relative_frequency: parseFloat(match.relative_frequency)
            });
          } else {
            // Fill missing combinations with zeros
            const typeInfo = rows.find(row => row.incident_type === type);
            result.push({
              period: weekday,
              incident_count: 0,
              avg_severity: 0,
              severity_stddev: 0,
              min_severity: 0,
              max_severity: 0,
              incident_type: type,
              type_id: typeInfo?.type_id || null,
              color: typeInfo?.color || '#999999',
              relative_frequency: 0,
              hour_distribution: []
            });
          }
        }
      }
      return result;
    }
    
    // For other groupings, return as-is with proper type conversion
    return rows.map(row => ({
      ...row,
      period: row.time_period || row.time_group || row.period,
      incident_count: parseInt(row.incident_count),
      avg_severity: parseFloat(row.avg_severity),
      severity_stddev: parseFloat(row.severity_stddev || 0),
      relative_frequency: parseFloat(row.relative_frequency || 0)
    }));
  }
  
  /**
   * Calculate advanced trends with statistical significance
   * @private
   */
  calculateAdvancedTrends(patterns, groupBy) {
    const typeGroups = {};
    
    // Group patterns by incident type
    patterns.forEach(pattern => {
      if (!typeGroups[pattern.incident_type]) {
        typeGroups[pattern.incident_type] = [];
      }
      typeGroups[pattern.incident_type].push({
        period: pattern.period,
        count: pattern.incident_count,
        severity: pattern.avg_severity,
        relativeFrequency: pattern.relative_frequency || 0
      });
    });
    
    const trends = [];
    
    for (const [type, data] of Object.entries(typeGroups)) {
      // Skip if insufficient data points
      if (data.length < 2) continue;
      
      // Sort data appropriately
      let sortedData = [...data];
      if (groupBy !== 'weekday') {
        sortedData.sort((a, b) => new Date(a.period) - new Date(b.period));
      }
      
      // Calculate multiple trend indicators
      const countValues = sortedData.map(d => d.count);
      const severityValues = sortedData.map(d => d.severity);
      const frequencyValues = sortedData.map(d => d.relativeFrequency);
      
      const countTrend = this.calculateLinearTrend(countValues);
      const severityTrend = this.calculateLinearTrend(severityValues);
      const frequencyTrend = this.calculateLinearTrend(frequencyValues);
      
      // Calculate variability measures
      const countVariability = this.calculateVariability(countValues);
      const severityVariability = this.calculateVariability(severityValues);
      
      // Determine trend significance
      const trendSignificance = this.assessTrendSignificance(countTrend, countVariability, data.length);
      
      trends.push({
        incidentType: type,
        countTrend: countTrend.toFixed(3),
        severityTrend: severityTrend.toFixed(3),
        frequencyTrend: frequencyTrend.toFixed(3),
        countVariability: countVariability.toFixed(3),
        severityVariability: severityVariability.toFixed(3),
        trendSignificance,
        interpretation: this.interpretAdvancedTrend(countTrend, severityTrend, trendSignificance),
        dataPoints: sortedData.length,
        peakPeriod: this.findPeakPeriod(sortedData),
        averageCount: (countValues.reduce((a, b) => a + b, 0) / countValues.length).toFixed(2),
        averageSeverity: (severityValues.reduce((a, b) => a + b, 0) / severityValues.length).toFixed(2)
      });
    }
    
    return trends;
  }
  
  /**
   * Calculate linear trend using least squares regression
   * @private
   */
  calculateLinearTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const indices = Array.from({length: n}, (_, i) => i + 1);
    
    const sumX = indices.reduce((sum, x) => sum + x, 0);
    const sumY = values.reduce((sum, y) => sum + y, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
    
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;
    
    return (n * sumXY - sumX * sumY) / denominator;
  }
  
  /**
   * Calculate coefficient of variation for variability assessment
   * @private
   */
  calculateVariability(values) {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    if (mean === 0) return 0;
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev / mean; // Coefficient of variation
  }
  
  /**
   * Assess statistical significance of trends
   * @private
   */
  assessTrendSignificance(trend, variability, dataPoints) {
    const trendMagnitude = Math.abs(trend);
    
    if (dataPoints < 5) return 'insufficient-data';
    if (trendMagnitude < 0.1 && variability > 0.5) return 'not-significant';
    if (trendMagnitude > 0.5 && variability < 0.3) return 'highly-significant';
    if (trendMagnitude > 0.2) return 'significant';
    
    return 'moderate';
  }
  
  /**
   * Find the period with highest activity
   * @private
   */
  findPeakPeriod(data) {
    if (data.length === 0) return null;
    
    return data.reduce((max, current) => 
      current.count > max.count ? current : max
    ).period;
  }
  
  /**
   * Generate advanced trend interpretation
   * @private
   */
  interpretAdvancedTrend(countTrend, severityTrend, significance) {
    const countDirection = countTrend > 0.1 ? 'increasing' : countTrend < -0.1 ? 'decreasing' : 'stable';
    const severityDirection = severityTrend > 0.05 ? 'worsening' : severityTrend < -0.05 ? 'improving' : 'stable';
    
    let interpretation = `Incident frequency is ${countDirection}`;
    
    if (severityDirection !== 'stable') {
      interpretation += ` with ${severityDirection} severity`;
    }
    
    if (significance === 'highly-significant') {
      interpretation += ' (high confidence)';
    } else if (significance === 'not-significant') {
      interpretation += ' (low confidence due to variability)';
    }
    
    return interpretation;
  }
  
  /**
   * Parse time range string into PostgreSQL interval components
   * @private
   */
  parseTimeRange(timeRange) {
    const match = timeRange.match(/^(\d+)([dhwmy])$/);
    if (!match) return { value: 30, unit: 'days' };
    
    const value = parseInt(match[1]);
    const unitCode = match[2];
    
    const unitMap = {
      'd': 'days',
      'h': 'hours',
      'w': 'weeks',
      'm': 'months',
      'y': 'years'
    };
    
    return {
      value,
      unit: unitMap[unitCode],
      original: timeRange
    };
  }

  /**
   * Get performance metrics summary
   * @returns {Object} Performance statistics
   */
  getPerformanceMetrics() {
    const calculateStats = (metrics) => {
      if (metrics.length === 0) return null;
      
      const times = metrics.map(m => m.executionTime);
      return {
        count: metrics.length,
        avgTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        lastUsed: metrics[metrics.length - 1].timestamp
      };
    };

    return {
      hotspotGeneration: calculateStats(this.performanceMetrics.hotspotGeneration),
      impactZoneGeneration: calculateStats(this.performanceMetrics.impactZoneGeneration),
      temporalAnalysis: calculateStats(this.performanceMetrics.temporalAnalysis),
      predictiveModeling: calculateStats(this.performanceMetrics.predictiveModeling),
      densityCalculation: calculateStats(this.performanceMetrics.densityCalculation)
    };
  }
}

module.exports = AnalysisService;
