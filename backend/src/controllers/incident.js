/**
 * ==================================================
 * INCIDENT CONTROLLER
 * HTTP Request Handlers for Traffic Incident Management
 * ==================================================
 * 
 * This controller manages all HTTP operations for traffic incident
 * reporting and analysis. It integrates with the IncidentService
 * for business logic and broadcasts real-time updates via Socket.io.
 * 
 * ENDPOINT HANDLERS:
 * - POST /incidents: Create new incident reports
 * - GET /incidents: Search incidents with spatial filtering
 * - GET /incidents/:id: Get specific incident details
 * - PUT /incidents/:id: Update existing incidents (with ownership)
 * - DELETE /incidents/:id: Delete incidents (with ownership)
 * - POST /incidents/:id/verify: Community verification
 * - GET /incidents/clusters: Generate incident clusters for maps
 * - GET /incidents/heatmap: Generate heatmap data points
 * 
 * REAL-TIME FEATURES:
 * - New incident broadcasting to connected clients
 * - Incident updates and deletions broadcasted
 * - User-specific notifications for owned incidents
 * - Geographic area subscriptions for location-based updates
 * 
 * SECURITY FEATURES:
 * - Authentication required for all operations
 * - Ownership validation for updates/deletions
 * - Input validation and sanitization
 * - Rate limiting for incident creation
 * - Comprehensive audit logging
 * 
 * DEPENDENCIES:
 * - IncidentService: Business logic and data access
 * - Socket.io: Real-time event broadcasting
 * - Auth Middleware: User authentication and authorization
 * - Logger: Request and security logging
 * 
 * USAGE:
 * const incidentController = new IncidentController(incidentService, io);
 * router.post('/incidents', auth, validate, incidentController.createIncident);
 */

const logger = require('../services/logger');
const IncidentService = require('../services/incident');

class IncidentController {
  constructor(incidentService, socketIo) {
    this.incidentService = incidentService || new IncidentService();
    this.io = socketIo; // Socket.io instance for real-time updates
    
    // Bind methods to preserve 'this' context
    this.createIncident = this.createIncident.bind(this);
    this.getIncidents = this.getIncidents.bind(this);
    this.getIncidentById = this.getIncidentById.bind(this);
    this.updateIncident = this.updateIncident.bind(this);
    this.deleteIncident = this.deleteIncident.bind(this);
    this.verifyIncident = this.verifyIncident.bind(this);
    this.getIncidentClusters = this.getIncidentClusters.bind(this);
    this.getHeatmapData = this.getHeatmapData.bind(this);
    this.getIncidentTypes = this.getIncidentTypes.bind(this);
    this.getIncidentStatistics = this.getIncidentStatistics.bind(this);
  }

  /**
   * Create a new traffic incident
   * @route POST /api/incidents
   * @access Private (requires authentication)
   */
  async createIncident(req, res) {
    try {
      const userId = req.user.id;
      const incidentData = req.body;

      logger.info('IncidentController: Creating incident', {
        userId,
        username: req.user.username,
        incidentType: incidentData.typeId,
        location: {
          lat: incidentData.latitude,
          lon: incidentData.longitude,
        },
      });

      // Create incident using service layer
      const result = await this.incidentService.createIncident(incidentData, userId);

      // Broadcast new incident to connected clients
      if (this.io && result.success) {
        const broadcastData = {
          type: 'incident_created',
          incident: {
            id: result.incident.id,
            description: result.incident.description,
            severity: result.incident.severity,
            location: result.incident.location,
            incidentType: result.incident.incidentType,
            reportedBy: {
              id: result.incident.reportedBy.id,
              username: result.incident.reportedBy.username,
            },
            createdAt: result.incident.timestamps.createdAt,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to all connected clients
        this.io.emit('new-incident', broadcastData);

        // Send to specific geographic area room (if implemented)
        const locationRoom = this.getLocationRoom(
          result.incident.location.latitude,
          result.incident.location.longitude
        );
        this.io.to(locationRoom).emit('area-incident', broadcastData);

        logger.debug('IncidentController: Real-time incident broadcast sent', {
          incidentId: result.incident.id,
          locationRoom,
          connectedClients: this.io.engine.clientsCount,
        });
      }

      // Log incident creation for analytics
      logger.info('IncidentController: Incident created successfully', {
        incidentId: result.incident.id,
        userId,
        typeId: incidentData.typeId,
        severity: result.incident.severity,
        location: result.incident.location,
      });

      res.status(201).json({
        success: true,
        message: 'Incident reported successfully',
        incident: result.incident,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'create_incident',
        userId: req.user?.id,
        incidentData: req.body,
      });

      if (error.message.includes('Invalid coordinates')) {
        return res.status(400).json({
          error: 'Invalid location',
          message: 'The provided coordinates are not valid',
        });
      }

      if (error.message.includes('Invalid incident type')) {
        return res.status(400).json({
          error: 'Invalid incident type',
          message: 'The specified incident type does not exist',
        });
      }

      if (error.message.includes('Severity must be between')) {
        return res.status(400).json({
          error: 'Invalid severity',
          message: error.message,
        });
      }

      res.status(500).json({
        error: 'Incident creation failed',
        message: 'Unable to create incident report',
      });
    }
  }

  /**
   * Search and retrieve incidents with spatial filtering
   * @route GET /api/incidents
   * @access Private (requires authentication)
   */
  async getIncidents(req, res) {
    try {
      const searchParams = req.query;
      const userId = req.user.id;

      logger.debug('IncidentController: Searching incidents', {
        userId,
        searchParams,
      });

      // Search incidents using service layer
      const result = await this.incidentService.searchIncidents(searchParams);

      logger.debug('IncidentController: Incident search completed', {
        userId,
        found: result.incidents.length,
        total: result.pagination.total,
        page: result.pagination.page,
      });

      res.json({
        success: true,
        incidents: result.incidents,
        pagination: result.pagination,
        searchParams: result.searchParams,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incidents',
        userId: req.user?.id,
        searchParams: req.query,
      });

      if (error.message.includes('Invalid search coordinates')) {
        return res.status(400).json({
          error: 'Invalid coordinates',
          message: 'The provided search coordinates are not valid',
        });
      }

      res.status(500).json({
        error: 'Incident search failed',
        message: 'Unable to retrieve incidents',
      });
    }
  }

  /**
   * Get specific incident by ID
   * @route GET /api/incidents/:id
   * @access Private (requires authentication)
   */
  async getIncidentById(req, res) {
    try {
      const incidentId = parseInt(req.params.id);
      const userId = req.user.id;

      if (!incidentId || isNaN(incidentId)) {
        return res.status(400).json({
          error: 'Invalid incident ID',
          message: 'Incident ID must be a valid number',
        });
      }

      logger.debug('IncidentController: Fetching incident by ID', {
        incidentId,
        userId,
      });

      const incident = await this.incidentService.getIncidentById(incidentId);

      if (!incident) {
        return res.status(404).json({
          error: 'Incident not found',
          message: 'The requested incident does not exist',
        });
      }

      logger.debug('IncidentController: Incident retrieved', {
        incidentId,
        userId,
        reportedBy: incident.reportedBy.id,
      });

      res.json({
        success: true,
        incident,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incident_by_id',
        userId: req.user?.id,
        incidentId: req.params.id,
      });

      res.status(500).json({
        error: 'Incident retrieval failed',
        message: 'Unable to retrieve incident details',
      });
    }
  }

  /**
   * Update an existing incident
   * @route PUT /api/incidents/:id
   * @access Private (requires authentication and ownership)
   */
  async updateIncident(req, res) {
    try {
      const incidentId = parseInt(req.params.id);
      const userId = req.user.id;
      const updateData = req.body;
      const isAdmin = req.user.role === 'admin';

      if (!incidentId || isNaN(incidentId)) {
        return res.status(400).json({
          error: 'Invalid incident ID',
          message: 'Incident ID must be a valid number',
        });
      }

      logger.info('IncidentController: Updating incident', {
        incidentId,
        userId,
        isAdmin,
        updateData,
      });

      // Update incident using service layer
      const result = await this.incidentService.updateIncident(
        incidentId,
        updateData,
        userId,
        isAdmin
      );

      // Broadcast incident update to connected clients
      if (this.io && result.success) {
        const broadcastData = {
          type: 'incident_updated',
          incident: {
            id: result.incident.id,
            description: result.incident.description,
            severity: result.incident.severity,
            location: result.incident.location,
            incidentType: result.incident.incidentType,
            updatedFields: Object.keys(updateData),
          },
          updatedBy: {
            id: userId,
            username: req.user.username,
          },
          timestamp: new Date().toISOString(),
        };

        this.io.emit('incident-updated', broadcastData);

        // Send notification to incident owner if updated by someone else
        if (result.incident.reportedBy.id !== userId) {
          this.io.to(`user-${result.incident.reportedBy.id}`).emit('incident-notification', {
            type: 'incident_updated_by_other',
            incidentId: result.incident.id,
            updatedBy: req.user.username,
            message: `Your incident report was updated by ${req.user.username}`,
          });
        }
      }

      logger.info('IncidentController: Incident updated successfully', {
        incidentId,
        userId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: 'Incident updated successfully',
        incident: result.incident,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'update_incident',
        userId: req.user?.id,
        incidentId: req.params.id,
        updateData: req.body,
      });

      if (error.message.includes('Incident not found')) {
        return res.status(404).json({
          error: 'Incident not found',
          message: 'The incident you are trying to update does not exist',
        });
      }

      if (error.message.includes('Not authorized')) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own incident reports',
        });
      }

      if (error.message.includes('Cannot update expired')) {
        return res.status(400).json({
          error: 'Incident expired',
          message: 'Cannot update expired incidents',
        });
      }

      res.status(500).json({
        error: 'Incident update failed',
        message: 'Unable to update incident',
      });
    }
  }

  /**
   * Delete an incident
   * @route DELETE /api/incidents/:id
   * @access Private (requires authentication and ownership)
   */
  async deleteIncident(req, res) {
    try {
      const incidentId = parseInt(req.params.id);
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!incidentId || isNaN(incidentId)) {
        return res.status(400).json({
          error: 'Invalid incident ID',
          message: 'Incident ID must be a valid number',
        });
      }

      logger.info('IncidentController: Deleting incident', {
        incidentId,
        userId,
        isAdmin,
      });

      // Get incident details before deletion for broadcasting
      const incident = await this.incidentService.getIncidentById(incidentId);
      
      if (!incident) {
        return res.status(404).json({
          error: 'Incident not found',
          message: 'The incident you are trying to delete does not exist',
        });
      }

      // Delete incident using service layer
      const result = await this.incidentService.deleteIncident(incidentId, userId, isAdmin);

      // Broadcast incident deletion to connected clients
      if (this.io && result.success) {
        const broadcastData = {
          type: 'incident_deleted',
          incidentId: incidentId,
          location: incident.location,
          deletedBy: {
            id: userId,
            username: req.user.username,
          },
          timestamp: new Date().toISOString(),
        };

        this.io.emit('incident-deleted', broadcastData);
      }

      logger.info('IncidentController: Incident deleted successfully', {
        incidentId,
        userId,
        deletedBy: userId,
        reportedBy: incident.reportedBy.id,
      });

      res.json({
        success: true,
        message: 'Incident deleted successfully',
        incidentId,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'delete_incident',
        userId: req.user?.id,
        incidentId: req.params.id,
      });

      if (error.message.includes('Incident not found')) {
        return res.status(404).json({
          error: 'Incident not found',
          message: 'The incident you are trying to delete does not exist',
        });
      }

      if (error.message.includes('Not authorized')) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own incident reports',
        });
      }

      res.status(500).json({
        error: 'Incident deletion failed',
        message: 'Unable to delete incident',
      });
    }
  }

  /**
   * Verify an incident (community verification)
   * @route POST /api/incidents/:id/verify
   * @access Private (requires authentication)
   */
  async verifyIncident(req, res) {
    try {
      const incidentId = parseInt(req.params.id);
      const userId = req.user.id;

      if (!incidentId || isNaN(incidentId)) {
        return res.status(400).json({
          error: 'Invalid incident ID',
          message: 'Incident ID must be a valid number',
        });
      }

      logger.info('IncidentController: Verifying incident', {
        incidentId,
        userId,
        username: req.user.username,
      });

      // Verify incident using service layer
      const result = await this.incidentService.verifyIncident(incidentId, userId);

      // Broadcast verification update if incident becomes verified
      if (this.io && result.isVerified) {
        const broadcastData = {
          type: 'incident_verified',
          incidentId: incidentId,
          verificationCount: result.verificationCount,
          verifiedBy: {
            id: userId,
            username: req.user.username,
          },
          timestamp: new Date().toISOString(),
        };

        this.io.emit('incident-verified', broadcastData);
      }

      logger.info('IncidentController: Incident verification added', {
        incidentId,
        userId,
        verificationCount: result.verificationCount,
        isVerified: result.isVerified,
      });

      res.json({
        success: true,
        message: result.isVerified 
          ? 'Incident has been verified by the community'
          : 'Your verification has been recorded',
        verificationCount: result.verificationCount,
        isVerified: result.isVerified,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'verify_incident',
        userId: req.user?.id,
        incidentId: req.params.id,
      });

      if (error.message.includes('already verified')) {
        return res.status(400).json({
          error: 'Already verified',
          message: 'You have already verified this incident',
        });
      }

      res.status(500).json({
        error: 'Verification failed',
        message: 'Unable to verify incident',
      });
    }
  }

  /**
   * Generate incident clusters for map visualization
   * @route GET /api/incidents/clusters
   * @access Private (requires authentication)
   */
  async getIncidentClusters(req, res) {
    try {
      const clusterParams = req.query;
      const userId = req.user.id;

      logger.debug('IncidentController: Generating incident clusters', {
        userId,
        clusterParams,
      });

      // Generate clusters using service layer
      const result = await this.incidentService.getIncidentClusters(clusterParams);

      logger.debug('IncidentController: Clusters generated', {
        userId,
        clusterCount: result.clusters.length,
        parameters: result.parameters,
      });

      res.json({
        success: true,
        clusters: result.clusters,
        parameters: result.parameters,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incident_clusters',
        userId: req.user?.id,
        clusterParams: req.query,
      });

      res.status(500).json({
        error: 'Cluster generation failed',
        message: 'Unable to generate incident clusters',
      });
    }
  }

  /**
   * Generate heatmap data for incident density visualization
   * @route GET /api/incidents/heatmap
   * @access Private (requires authentication)
   */
  async getHeatmapData(req, res) {
    try {
      const heatmapParams = req.query;
      const userId = req.user.id;

      logger.debug('IncidentController: Generating heatmap data', {
        userId,
        heatmapParams,
      });

      // Generate heatmap data using service layer
      const result = await this.incidentService.getHeatmapData(heatmapParams);

      logger.debug('IncidentController: Heatmap data generated', {
        userId,
        pointCount: result.heatmapPoints.length,
        parameters: result.parameters,
      });

      res.json({
        success: true,
        heatmapPoints: result.heatmapPoints,
        parameters: result.parameters,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_heatmap_data',
        userId: req.user?.id,
        heatmapParams: req.query,
      });

      res.status(500).json({
        error: 'Heatmap generation failed',
        message: 'Unable to generate heatmap data',
      });
    }
  }

  /**
   * Get available incident types
   * @route GET /api/incidents/types
   * @access Private (requires authentication)
   */
  async getIncidentTypes(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('IncidentController: Fetching incident types', {
        userId,
      });

      // This would typically come from the database
      const db = this.incidentService.db;
      const query = `
        SELECT 
          id, name, category, description, 
          severity_range, default_severity, 
          icon, color, requires_verification
        FROM incident_types
        ORDER BY category, name
      `;

      const result = await db.query(query);

      const incidentTypes = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        severityRange: JSON.parse(row.severity_range),
        defaultSeverity: row.default_severity,
        icon: row.icon,
        color: row.color,
        requiresVerification: row.requires_verification,
      }));

      res.json({
        success: true,
        incidentTypes,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incident_types',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to retrieve incident types',
        message: 'Unable to get available incident types',
      });
    }
  }

  /**
   * Get incident statistics for reporting and analytics
   * @route GET /api/incidents/statistics
   * @access Private (requires authentication)
   */
  async getIncidentStatistics(req, res) {
    try {
      const statsParams = req.query;
      const userId = req.user.id;

      logger.debug('IncidentController: Generating incident statistics', {
        userId,
        statsParams,
      });

      // Generate statistics using service layer
      const result = await this.incidentService.getIncidentStatistics(statsParams);

      res.json({
        success: true,
        statistics: result.statistics,
        parameters: result.parameters,
      });

    } catch (error) {
      logger.logError(error, req, {
        operation: 'get_incident_statistics',
        userId: req.user?.id,
        statsParams: req.query,
      });

      res.status(500).json({
        error: 'Statistics generation failed',
        message: 'Unable to generate incident statistics',
      });
    }
  }

  /**
   * Helper method to determine geographic room for real-time updates
   * @private
   */
  getLocationRoom(latitude, longitude) {
    // Simple grid-based room assignment (can be enhanced with geohash)
    const latGrid = Math.floor(latitude * 10); // 0.1 degree precision
    const lonGrid = Math.floor(longitude * 10);
    return `geo_${latGrid}_${lonGrid}`;
  }
}

module.exports = IncidentController;
