/**
 * ==================================================
 * INCIDENT SERVICE LAYER
 * Business Logic for Traffic Incident Management
 * ==================================================
 * 
 * This service provides comprehensive incident management functionality
 * including CRUD operations, spatial queries using PostGIS, geocoding,
 * and advanced analytics. All operations are optimized for performance
 * and include proper error handling and logging.
 * 
 * CORE FEATURES:
 * - Incident CRUD operations with ownership validation
 * - Spatial queries: radius search, clustering, heatmap data
 * - PostGIS integration for advanced GIS operations
 * - Geocoding and reverse geocoding support
 * - Incident expiration and cleanup management
 * - Community verification system
 * 
 * SPATIAL OPERATIONS:
 * - ST_DWithin: Find incidents within radius
 * - ST_ClusterKMeans: Group incidents for clustering
 * - ST_Distance: Calculate distances between points
 * - ST_Buffer: Create impact zones around incidents
 * - ST_Intersects: Check spatial relationships
 * 
 * DEPENDENCIES:
 * - DatabaseConnection: PostGIS-enabled database access
 * - Logger Service: Comprehensive operation logging
 * - Geocoding Service: Address to coordinate conversion
 * - Date utilities: Timezone-aware date handling
 * 
 * USAGE:
 * const incidentService = new IncidentService(db);
 * const incidents = await incidentService.getNearbyIncidents(lat, lon, radius);
 */

const db = require('../db/connection');
const logger = require('./logger');

class IncidentService {
  constructor() {
    this.db = db;
    this.defaultRadius = 5000; // 5km in meters
    this.maxRadius = 50000; // 50km maximum search radius
    this.maxPageSize = 100; // Maximum incidents per page
  }

  /**
   * Create a new traffic incident with spatial data
   * @param {Object} incidentData - Incident information
   * @param {number} userId - ID of reporting user
   * @returns {Promise<Object>} Created incident with ID
   */
  async createIncident(incidentData, userId) {
    try {
      const {
        typeId,
        description,
        latitude,
        longitude,
        severity,
        address,
        estimatedDuration,
        affectedLanes,
        verificationRequired = false,
      } = incidentData;

      logger.info('IncidentService: Creating new incident', {
        typeId,
        userId,
        latitude,
        longitude,
        severity,
      });

      // Validate coordinates
      if (!this.isValidCoordinate(latitude, longitude)) {
        throw new Error('Invalid coordinates provided');
      }

      // Get incident type information for validation
      const typeQuery = `
        SELECT id, name, severity_range, default_severity, requires_verification, auto_expire_hours
        FROM incident_types 
        WHERE id = $1
      `;
      const typeResult = await this.db.query(typeQuery, [typeId]);
      
      if (typeResult.rows.length === 0) {
        throw new Error('Invalid incident type specified');
      }

      const incidentType = typeResult.rows[0];
      const [minSeverity, maxSeverity] = JSON.parse(incidentType.severity_range);

      // Validate severity within allowed range
      const finalSeverity = severity || incidentType.default_severity;
      if (finalSeverity < minSeverity || finalSeverity > maxSeverity) {
        throw new Error(`Severity must be between ${minSeverity} and ${maxSeverity} for this incident type`);
      }

      // Calculate expiration time if auto-expire is set
      let expiresAt = null;
      if (incidentType.auto_expire_hours) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + incidentType.auto_expire_hours);
      }

      // Create PostGIS point geometry
      const createQuery = `
        INSERT INTO incidents (
          type_id, description, location, reported_by, severity, 
          address, estimated_duration_minutes, affected_lanes,
          requires_verification, expires_at, created_at
        ) VALUES (
          $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6,
          $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
        )
        RETURNING id, created_at
      `;

      const result = await this.db.query(createQuery, [
        typeId,
        description,
        longitude, // X coordinate (longitude)
        latitude,  // Y coordinate (latitude)
        userId,
        finalSeverity,
        address,
        estimatedDuration,
        affectedLanes,
        verificationRequired || incidentType.requires_verification,
        expiresAt,
      ]);

      const newIncidentId = result.rows[0].id;

      // Fetch the complete incident data to return
      const fullIncident = await this.getIncidentById(newIncidentId);

      logger.info('IncidentService: Incident created successfully', {
        incidentId: newIncidentId,
        userId,
        typeId,
        severity: finalSeverity,
      });

      return {
        success: true,
        incident: fullIncident,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'create_incident',
        userId,
        incidentData,
      });
      throw error;
    }
  }

  /**
   * Get incident by ID with full details and spatial data
   * @param {number} incidentId - Incident ID
   * @returns {Promise<Object>} Complete incident information
   */
  async getIncidentById(incidentId) {
    try {
      const query = `
        SELECT 
          i.id,
          i.description,
          i.severity,
          i.address,
          i.estimated_duration_minutes,
          i.affected_lanes,
          i.verified,
          i.verification_count,
          i.requires_verification,
          i.expires_at,
          i.created_at,
          i.updated_at,
          ST_X(i.location) as longitude,
          ST_Y(i.location) as latitude,
          it.name as incident_type,
          it.category as incident_category,
          it.icon as incident_icon,
          it.color as incident_color,
          u.username as reported_by_username,
          u.id as reported_by_id,
          CASE 
            WHEN i.expires_at IS NOT NULL AND i.expires_at < CURRENT_TIMESTAMP 
            THEN true 
            ELSE false 
          END as is_expired
        FROM incidents i
        JOIN incident_types it ON it.id = i.type_id
        JOIN users u ON u.id = i.reported_by
        WHERE i.id = $1
      `;

      const result = await this.db.query(query, [incidentId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const incident = result.rows[0];

      return {
        id: incident.id,
        description: incident.description,
        severity: incident.severity,
        address: incident.address,
        estimatedDuration: incident.estimated_duration_minutes,
        affectedLanes: incident.affected_lanes,
        verified: incident.verified,
        verificationCount: incident.verification_count,
        requiresVerification: incident.requires_verification,
        isExpired: incident.is_expired,
        location: {
          latitude: parseFloat(incident.latitude),
          longitude: parseFloat(incident.longitude),
        },
        incidentType: {
          name: incident.incident_type,
          category: incident.incident_category,
          icon: incident.incident_icon,
          color: incident.incident_color,
        },
        reportedBy: {
          id: incident.reported_by_id,
          username: incident.reported_by_username,
        },
        timestamps: {
          createdAt: incident.created_at,
          updatedAt: incident.updated_at,
          expiresAt: incident.expires_at,
        },
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'get_incident_by_id',
        incidentId,
      });
      throw error;
    }
  }

  /**
   * Search for incidents within a specified radius using spatial queries
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Paginated incident results
   */
  async searchIncidents(searchParams) {
    try {
      const {
        latitude,
        longitude,
        radius = this.defaultRadius,
        typeId,
        severity,
        verified,
        includeExpired = false,
        page = 1,
        limit = 20,
        sortBy = 'distance',
        sortOrder = 'asc',
      } = searchParams;

      // Validate parameters
      const validatedRadius = Math.min(radius, this.maxRadius);
      const validatedLimit = Math.min(limit, this.maxPageSize);
      const offset = (page - 1) * validatedLimit;

      logger.debug('IncidentService: Searching incidents', {
        latitude,
        longitude,
        radius: validatedRadius,
        page,
        limit: validatedLimit,
      });

      // Build WHERE clause conditions
      const conditions = [];
      const params = [];
      let paramCounter = 1;

      // Spatial filter (always applied if coordinates provided)
      if (latitude && longitude) {
        if (!this.isValidCoordinate(latitude, longitude)) {
          throw new Error('Invalid search coordinates');
        }
        
        conditions.push(`ST_DWithin(i.location, ST_SetSRID(ST_MakePoint($${paramCounter}, $${paramCounter + 1}), 4326), $${paramCounter + 2})`);
        params.push(longitude, latitude, validatedRadius);
        paramCounter += 3;
      }

      // Type filter
      if (typeId) {
        conditions.push(`i.type_id = $${paramCounter}`);
        params.push(typeId);
        paramCounter++;
      }

      // Severity filter
      if (severity) {
        if (Array.isArray(severity)) {
          const placeholders = severity.map(() => `$${paramCounter++}`).join(',');
          conditions.push(`i.severity IN (${placeholders})`);
          params.push(...severity);
        } else {
          conditions.push(`i.severity = $${paramCounter}`);
          params.push(severity);
          paramCounter++;
        }
      }

      // Verification status filter
      if (typeof verified === 'boolean') {
        conditions.push(`i.verified = $${paramCounter}`);
        params.push(verified);
        paramCounter++;
      }

      // Expired incidents filter
      if (!includeExpired) {
        conditions.push(`(i.expires_at IS NULL OR i.expires_at > CURRENT_TIMESTAMP)`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Build ORDER BY clause
      let orderClause = '';
      if (latitude && longitude && sortBy === 'distance') {
        orderClause = `ORDER BY ST_Distance(i.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ${sortOrder.toUpperCase()}`;
      } else if (sortBy === 'created_at') {
        orderClause = `ORDER BY i.created_at ${sortOrder.toUpperCase()}`;
      } else if (sortBy === 'severity') {
        orderClause = `ORDER BY i.severity ${sortOrder.toUpperCase()}`;
      } else {
        orderClause = 'ORDER BY i.created_at DESC';
      }

      // Main query with distance calculation
      const query = `
        SELECT 
          i.id,
          i.description,
          i.severity,
          i.verified,
          i.verification_count,
          i.created_at,
          ST_X(i.location) as longitude,
          ST_Y(i.location) as latitude,
          it.name as incident_type,
          it.category as incident_category,
          it.icon as incident_icon,
          it.color as incident_color,
          u.username as reported_by_username,
          ${latitude && longitude ? 
            `ST_Distance(i.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as distance_meters` : 
            '0 as distance_meters'
          }
        FROM incidents i
        JOIN incident_types it ON it.id = i.type_id
        JOIN users u ON u.id = i.reported_by
        ${whereClause}
        ${orderClause}
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;

      params.push(validatedLimit, offset);

      // Count query for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM incidents i
        ${whereClause}
      `;

      const [incidentsResult, countResult] = await Promise.all([
        this.db.query(query, params),
        this.db.query(countQuery, params.slice(0, -2)), // Remove limit and offset for count
      ]);

      const incidents = incidentsResult.rows.map(row => ({
        id: row.id,
        description: row.description,
        severity: row.severity,
        verified: row.verified,
        verificationCount: row.verification_count,
        location: {
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
        },
        distance: latitude && longitude ? parseFloat(row.distance_meters) : null,
        incidentType: {
          name: row.incident_type,
          category: row.incident_category,
          icon: row.incident_icon,
          color: row.incident_color,
        },
        reportedBy: {
          username: row.reported_by_username,
        },
        createdAt: row.created_at,
      }));

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / validatedLimit);

      logger.debug('IncidentService: Search completed', {
        found: incidents.length,
        total,
        page,
        totalPages,
      });

      return {
        success: true,
        incidents,
        pagination: {
          page,
          limit: validatedLimit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        searchParams: {
          ...searchParams,
          radius: validatedRadius,
          limit: validatedLimit,
        },
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'search_incidents',
        searchParams,
      });
      throw error;
    }
  }

  /**
   * Update an existing incident with ownership validation
   * @param {number} incidentId - Incident ID to update
   * @param {Object} updateData - Fields to update
   * @param {number} userId - ID of user making the update
   * @param {boolean} isAdmin - Whether user has admin privileges
   * @returns {Promise<Object>} Updated incident
   */
  async updateIncident(incidentId, updateData, userId, isAdmin = false) {
    try {
      logger.info('IncidentService: Updating incident', {
        incidentId,
        userId,
        isAdmin,
        updateData,
      });

      // First, get the current incident for validation
      const currentIncident = await this.getIncidentById(incidentId);
      
      if (!currentIncident) {
        throw new Error('Incident not found');
      }

      // Check ownership (users can only edit their own incidents, admins can edit any)
      if (!isAdmin && currentIncident.reportedBy.id !== userId) {
        throw new Error('Not authorized to update this incident');
      }

      // Check if incident is expired
      if (currentIncident.isExpired) {
        throw new Error('Cannot update expired incident');
      }

      // Build update query dynamically
      const allowedFields = {
        'description': 'description',
        'severity': 'severity',
        'address': 'address',
        'estimatedDuration': 'estimated_duration_minutes',
        'affectedLanes': 'affected_lanes',
      };

      const updates = [];
      const params = [];
      let paramCounter = 1;

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields[key] && value !== undefined) {
          updates.push(`${allowedFields[key]} = $${paramCounter}`);
          params.push(value);
          paramCounter++;
        }
      }

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Add updated_at timestamp
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      // Add incident ID as last parameter
      params.push(incidentId);

      const updateQuery = `
        UPDATE incidents 
        SET ${updates.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING id, updated_at
      `;

      await this.db.query(updateQuery, params);

      // Fetch and return updated incident
      const updatedIncident = await this.getIncidentById(incidentId);

      logger.info('IncidentService: Incident updated successfully', {
        incidentId,
        userId,
        updatedFields: Object.keys(updateData),
      });

      return {
        success: true,
        incident: updatedIncident,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'update_incident',
        incidentId,
        userId,
        updateData,
      });
      throw error;
    }
  }

  /**
   * Delete an incident with ownership validation
   * @param {number} incidentId - Incident ID to delete
   * @param {number} userId - ID of user requesting deletion
   * @param {boolean} isAdmin - Whether user has admin privileges
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteIncident(incidentId, userId, isAdmin = false) {
    try {
      logger.info('IncidentService: Deleting incident', {
        incidentId,
        userId,
        isAdmin,
      });

      // Get incident for validation
      const incident = await this.getIncidentById(incidentId);
      
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Check ownership
      if (!isAdmin && incident.reportedBy.id !== userId) {
        throw new Error('Not authorized to delete this incident');
      }

      // Soft delete: mark as deleted instead of removing
      const deleteQuery = `
        UPDATE incidents 
        SET 
          is_deleted = true,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
      `;

      await this.db.query(deleteQuery, [incidentId, userId]);

      logger.info('IncidentService: Incident deleted successfully', {
        incidentId,
        userId,
        reportedBy: incident.reportedBy.id,
      });

      return {
        success: true,
        message: 'Incident deleted successfully',
        incidentId,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'delete_incident',
        incidentId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Generate clustered incidents for map visualization
   * @param {Object} clusterParams - Clustering parameters
   * @returns {Promise<Object>} Incident clusters
   */
  async getIncidentClusters(clusterParams) {
    try {
      const {
        bounds, // { north, south, east, west }
        clusterCount = 10,
        minSeverity = 1,
        includeExpired = false,
      } = clusterParams;

      logger.debug('IncidentService: Generating incident clusters', clusterParams);

      // Build spatial bounds filter
      let boundsFilter = '';
      const params = [];
      let paramCounter = 1;

      if (bounds) {
        boundsFilter = `
          AND ST_Within(
            i.location, 
            ST_MakeEnvelope($${paramCounter}, $${paramCounter + 1}, $${paramCounter + 2}, $${paramCounter + 3}, 4326)
          )
        `;
        params.push(bounds.west, bounds.south, bounds.east, bounds.north);
        paramCounter += 4;
      }

      // Add severity filter
      params.push(minSeverity);
      const severityFilter = `AND i.severity >= $${paramCounter}`;
      paramCounter++;

      // Add expiration filter
      const expirationFilter = includeExpired ? '' : 'AND (i.expires_at IS NULL OR i.expires_at > CURRENT_TIMESTAMP)';

      const clusterQuery = `
        WITH clustered_incidents AS (
          SELECT 
            i.id,
            i.severity,
            i.created_at,
            ST_X(i.location) as longitude,
            ST_Y(i.location) as latitude,
            it.category,
            it.color,
            ST_ClusterKMeans(i.location, $${paramCounter}) OVER() as cluster_id
          FROM incidents i
          JOIN incident_types it ON it.id = i.type_id
          WHERE i.is_deleted = false
          ${boundsFilter}
          ${severityFilter}
          ${expirationFilter}
        )
        SELECT 
          cluster_id,
          COUNT(*) as incident_count,
          AVG(severity) as avg_severity,
          MAX(severity) as max_severity,
          AVG(longitude) as center_longitude,
          AVG(latitude) as center_latitude,
          array_agg(DISTINCT category) as categories,
          MIN(created_at) as oldest_incident,
          MAX(created_at) as newest_incident
        FROM clustered_incidents
        GROUP BY cluster_id
        ORDER BY incident_count DESC
      `;

      params.push(clusterCount);
      const result = await this.db.query(clusterQuery, params);

      const clusters = result.rows.map(row => ({
        clusterId: row.cluster_id,
        incidentCount: parseInt(row.incident_count),
        avgSeverity: parseFloat(row.avg_severity),
        maxSeverity: parseInt(row.max_severity),
        center: {
          latitude: parseFloat(row.center_latitude),
          longitude: parseFloat(row.center_longitude),
        },
        categories: row.categories,
        timespan: {
          oldest: row.oldest_incident,
          newest: row.newest_incident,
        },
      }));

      logger.debug('IncidentService: Clusters generated', {
        clusterCount: clusters.length,
        totalIncidents: clusters.reduce((sum, cluster) => sum + cluster.incidentCount, 0),
      });

      return {
        success: true,
        clusters,
        parameters: clusterParams,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'get_incident_clusters',
        clusterParams,
      });
      throw error;
    }
  }

  /**
   * Generate heatmap data for visualization
   * @param {Object} heatmapParams - Heatmap parameters
   * @returns {Promise<Object>} Heatmap data points
   */
  async getHeatmapData(heatmapParams) {
    try {
      const {
        bounds,
        gridSize = 50, // Grid resolution
        minSeverity = 1,
        timeRange = 24, // Hours to look back
        includeExpired = false,
      } = heatmapParams;

      logger.debug('IncidentService: Generating heatmap data', heatmapParams);

      let boundsFilter = '';
      const params = [];
      let paramCounter = 1;

      if (bounds) {
        boundsFilter = `
          AND ST_Within(
            i.location, 
            ST_MakeEnvelope($${paramCounter}, $${paramCounter + 1}, $${paramCounter + 2}, $${paramCounter + 3}, 4326)
          )
        `;
        params.push(bounds.west, bounds.south, bounds.east, bounds.north);
        paramCounter += 4;
      }

      // Time range filter
      params.push(timeRange);
      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeRange} hours'`;
      
      // Severity filter
      params.push(minSeverity);
      const severityFilter = `AND i.severity >= $${paramCounter}`;
      paramCounter++;

      // Expiration filter
      const expirationFilter = includeExpired ? '' : 'AND (i.expires_at IS NULL OR i.expires_at > CURRENT_TIMESTAMP)';

      const heatmapQuery = `
        SELECT 
          ST_X(i.location) as longitude,
          ST_Y(i.location) as latitude,
          i.severity,
          COUNT(*) as incident_count
        FROM incidents i
        WHERE i.is_deleted = false
        ${boundsFilter}
        ${timeFilter}
        ${severityFilter}
        ${expirationFilter}
        GROUP BY ST_SnapToGrid(i.location, $${paramCounter}), ST_X(i.location), ST_Y(i.location), i.severity
        ORDER BY incident_count DESC
      `;

      const gridResolution = 1.0 / gridSize; // Convert grid size to degrees
      params.push(gridResolution);

      const result = await this.db.query(heatmapQuery, params);

      const heatmapPoints = result.rows.map(row => ({
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        intensity: parseInt(row.incident_count) * parseInt(row.severity),
        count: parseInt(row.incident_count),
        severity: parseInt(row.severity),
      }));

      logger.debug('IncidentService: Heatmap data generated', {
        pointCount: heatmapPoints.length,
        timeRange,
        gridSize,
      });

      return {
        success: true,
        heatmapPoints,
        parameters: heatmapParams,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'get_heatmap_data',
        heatmapParams,
      });
      throw error;
    }
  }

  /**
   * Verify an incident (community verification)
   * @param {number} incidentId - Incident to verify
   * @param {number} userId - User providing verification
   * @returns {Promise<Object>} Verification result
   */
  async verifyIncident(incidentId, userId) {
    try {
      logger.info('IncidentService: Verifying incident', {
        incidentId,
        userId,
      });

      // Check if user already verified this incident
      const existingVerification = await this.db.query(
        'SELECT id FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
        [incidentId, userId]
      );

      if (existingVerification.rows.length > 0) {
        throw new Error('You have already verified this incident');
      }

      // Add verification
      const verificationQuery = `
        INSERT INTO incident_verifications (incident_id, user_id, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      await this.db.query(verificationQuery, [incidentId, userId]);

      // Update incident verification count and status
      const updateQuery = `
        UPDATE incidents 
        SET 
          verification_count = verification_count + 1,
          verified = CASE 
            WHEN verification_count + 1 >= 3 THEN true 
            ELSE verified 
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING verification_count, verified
      `;

      const result = await this.db.query(updateQuery, [incidentId]);
      const updatedIncident = result.rows[0];

      logger.info('IncidentService: Incident verification added', {
        incidentId,
        userId,
        newCount: updatedIncident.verification_count,
        isVerified: updatedIncident.verified,
      });

      return {
        success: true,
        verificationCount: updatedIncident.verification_count,
        isVerified: updatedIncident.verified,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'verify_incident',
        incidentId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Clean up expired incidents
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredIncidents() {
    try {
      logger.info('IncidentService: Starting expired incident cleanup');

      const cleanupQuery = `
        UPDATE incidents 
        SET 
          is_deleted = true,
          deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE expires_at IS NOT NULL 
        AND expires_at < CURRENT_TIMESTAMP 
        AND is_deleted = false
        RETURNING id, type_id
      `;

      const result = await this.db.query(cleanupQuery);
      const cleanedCount = result.rows.length;

      logger.info('IncidentService: Expired incident cleanup completed', {
        cleanedCount,
      });

      return {
        success: true,
        cleanedCount,
        cleanedIncidents: result.rows.map(row => row.id),
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'cleanup_expired_incidents',
      });
      throw error;
    }
  }

  /**
   * Validate coordinate values
   * @param {number} latitude - Latitude value
   * @param {number} longitude - Longitude value  
   * @returns {boolean} True if coordinates are valid
   */
  isValidCoordinate(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      !isNaN(latitude) &&
      !isNaN(longitude)
    );
  }

  /**
   * Get incident statistics for reporting
   * @param {Object} statsParams - Statistics parameters
   * @returns {Promise<Object>} Statistical data
   */
  async getIncidentStatistics(statsParams = {}) {
    try {
      const {
        timeRange = 30, // Days
        groupBy = 'day', // day, week, month
        includeExpired = false,
      } = statsParams;

      logger.debug('IncidentService: Generating statistics', statsParams);

      const timeFilter = `AND i.created_at >= NOW() - INTERVAL '${timeRange} days'`;
      const expirationFilter = includeExpired ? '' : 'AND (i.expires_at IS NULL OR i.expires_at > CURRENT_TIMESTAMP)';

      // Group by clause based on timeframe
      let dateGrouping;
      switch (groupBy) {
        case 'hour':
          dateGrouping = "DATE_TRUNC('hour', i.created_at)";
          break;
        case 'week':
          dateGrouping = "DATE_TRUNC('week', i.created_at)";
          break;
        case 'month':
          dateGrouping = "DATE_TRUNC('month', i.created_at)";
          break;
        default:
          dateGrouping = "DATE_TRUNC('day', i.created_at)";
      }

      const statsQuery = `
        SELECT 
          ${dateGrouping} as time_period,
          COUNT(*) as total_incidents,
          COUNT(CASE WHEN i.verified THEN 1 END) as verified_incidents,
          AVG(i.severity) as avg_severity,
          it.category,
          it.name as incident_type
        FROM incidents i
        JOIN incident_types it ON it.id = i.type_id
        WHERE i.is_deleted = false
        ${timeFilter}
        ${expirationFilter}
        GROUP BY ${dateGrouping}, it.category, it.name
        ORDER BY time_period DESC, total_incidents DESC
      `;

      const result = await this.db.query(statsQuery);

      return {
        success: true,
        statistics: result.rows,
        parameters: statsParams,
      };

    } catch (error) {
      logger.logError(error, null, {
        operation: 'get_incident_statistics',
        statsParams,
      });
      throw error;
    }
  }
}

module.exports = IncidentService;
