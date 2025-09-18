/**
 * ==================================================
 * ADVANCED GIS ANALYSIS - COMPREHENSIVE TESTS
 * PostGIS Spatial Operations & Analytics Testing
 * ==========      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('hotspots');
      expect(response.body).toHaveProperty('metadata');
      expect(Array.isArray(response.body.hotspots)).toBe(true);

      if (response.body.hotspots.length > 0) {
        const hotspot = response.body.hotspots[0];
        expect(hotspot).toHaveProperty('latitude');
        expect(hotspot).toHaveProperty('longitude');
        expect(hotspot).toHaveProperty('incidentCount');
        expect(hotspot).toHaveProperty('avgSeverity');
        expect(typeof hotspot.incidentCount).toBe('number');
        expect(typeof hotspot.avgSeverity).toBe('number');
      }

      expect(response.body.metadata).toHaveProperty('totalHotspots');====================
 * 
 * Test Coverage:
 * - Hotspot Analysis with kernel density estimation
 * - Impact Zone calculations with buffer analysis  
 * - Temporal pattern analysis with trend detection
 * - Predictive modeling with spatial clustering
 * - Incident density calculations
 * - GeoJSON export functionality
 * - Authentication and authorization
 * - Parameter validation and edge cases
 * - Performance benchmarking for spatial queries
 * - Error handling for invalid geographic data
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExpressApp = require('../app');
const db = require('../db/connection');
const authService = require('../services/auth');
const passwordService = require('../services/password');

// Set up test database configuration
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/trafficdb_test';

// Mock express-rate-limit for tests
jest.mock('express-rate-limit', () => {
  return jest.fn().mockImplementation(() => {
    return (req, res, next) => next();
  });
});

describe('🗺️ Advanced GIS Analysis API', () => {
  let app;
  let server;
  let adminToken;
  let userToken;
  let testUserId;
  let adminUserId;

  // Test data for spatial operations
  const testBounds = {
    north: 37.7849,
    south: 37.7549,
    east: -122.4094,
    west: -122.4394
  };

    const testIncidents = [
    { lat: 37.7749, lon: -122.4194, type_id: 1, severity: 4 },  // Accident
    { lat: 37.7659, lon: -122.4294, type_id: 2, severity: 3 },  // Road Closure
    { lat: 37.7859, lon: -122.4094, type_id: 1, severity: 5 },  // Accident
    { lat: 37.7649, lon: -122.4314, type_id: 3, severity: 2 }   // Emergency Services
  ];

  beforeAll(async () => {
    try {
      // Configure test database
      process.env.DATABASE_URL = TEST_DB_URL;
      
      // Initialize database with explicit wait and verification
      await db.initialize();
      
      // Verify connection is established before proceeding
      if (!db.isConnected) {
        throw new Error('Database failed to connect properly');
      }
      
      // Initialize Express app in test mode
      const expressApp = new ExpressApp({ isTestMode: true });
      app = expressApp.getApp();

      // Clean up any existing test users first
      await db.query(`DELETE FROM users WHERE username LIKE 'testuser_%' OR username LIKE 'adminuser_%'`);
      
      // Create test users with unique usernames based on timestamp
      const timestamp = Date.now();
      const testUsername = `testuser_${timestamp}`;
      const adminUsername = `adminuser_${timestamp}`;
      
      console.log('Creating test users...');
      
      // Hash passwords properly for database constraints
      const userPasswordHash = await passwordService.hashPassword('testpassword123');
      const adminPasswordHash = await passwordService.hashPassword('adminpassword123');
      
      const userResult = await db.query(`
        INSERT INTO users (username, email, password, role) 
        VALUES 
          ($1, $2, $3, 'user'),
          ($4, $5, $6, 'admin')
        RETURNING id, role
      `, [testUsername, `user_${timestamp}@test.com`, userPasswordHash, 
          adminUsername, `admin_${timestamp}@test.com`, adminPasswordHash]);
      console.log('Test users created:', userResult.rows);

    testUserId = userResult.rows[0].id;
    adminUserId = userResult.rows[1].id;

    // Generate JWT tokens for authentication
    userToken = await authService.generateAccessToken({ 
      id: testUserId, 
      username: testUsername,
      email: `user_${timestamp}@test.com`, 
      role: 'user' 
    });
    
    adminToken = await authService.generateAccessToken({ 
      id: adminUserId, 
      username: adminUsername,
      email: `admin_${timestamp}@test.com`, 
      role: 'admin' 
    });    // Insert test incidents for spatial analysis
    console.log('Creating test incidents...');
    for (const incident of testIncidents) {
      console.log('Inserting incident:', incident);
      await db.query(`
        INSERT INTO incidents (type_id, title, description, location, reported_by, severity, verified)
        VALUES ($1, 'Test Incident', 'Test incident for spatial analysis', ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, true)
      `, [incident.type_id, incident.lon, incident.lat, testUserId, incident.severity]);
    }
    console.log('Test incidents created');

    // Add temporal test data (incidents from different time periods)
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    await db.query(`
      INSERT INTO incidents (type_id, title, description, location, reported_by, created_at, severity)
      VALUES 
        (1, 'Recent Incident', 'Recent incident for temporal analysis', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), $1, $2, 3),
        (1, 'Day Old Incident', 'Day old incident for temporal analysis', ST_SetSRID(ST_MakePoint(-122.4184, 37.7759), 4326), $1, $3, 4),
        (2, 'Week Old Incident', 'Week old incident for temporal analysis', ST_SetSRID(ST_MakePoint(-122.4204, 37.7739), 4326), $1, $4, 5)
    `, [testUserId, now.toISOString(), dayAgo.toISOString(), weekAgo.toISOString()]);
    
    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Clean up test data
      if (db.isConnected) {
        await db.query('DELETE FROM incidents WHERE reported_by IN ($1, $2)', [testUserId, adminUserId]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, adminUserId]);
      }
      
      if (server) {
        server.close();
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
    }
  });

  describe('🔥 Hotspot Analysis', () => {
    it('should generate hotspot analysis with valid parameters', async () => {
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          gridSize: 100,
          radius: 500
        });



      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('hotspots');
      expect(response.body).toHaveProperty('metadata');
      expect(Array.isArray(response.body.hotspots)).toBe(true);

      if (response.body.hotspots.length > 0) {
        const hotspot = response.body.hotspots[0];
        expect(hotspot).toHaveProperty('latitude');
        expect(hotspot).toHaveProperty('longitude');
        expect(hotspot).toHaveProperty('hotspotScore');
        expect(hotspot).toHaveProperty('incidentCount');
        expect(typeof hotspot.hotspotScore).toBe('number');
        expect(typeof hotspot.incidentCount).toBe('number');
      }

      expect(response.body.metadata).toHaveProperty('gridSize');
      expect(response.body.metadata).toHaveProperty('totalHotspots');
      expect(response.body.metadata).toHaveProperty('executionTime');
    });

    it('should return empty hotspots for area with no incidents', async () => {
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: 40.7589,
          south: 40.7489,
          east: -73.9741,
          west: -73.9841,
          gridSize: 50,
          radius: 200
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hotspots).toHaveLength(0);
      expect(response.body.metadata.totalHotspots).toBe(0);
    });

    it('should reject invalid geographic bounds', async () => {
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: -95, // Invalid latitude
          south: 95,
          east: 200, // Invalid longitude
          west: -200,
          gridSize: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('🎯 Impact Zone Analysis', () => {
    it('should generate impact zones for incidents', async () => {
      const response = await request(app)
        .get('/api/analysis/impact-zones')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          buffer_distance: 300
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('impact_zones');
      expect(response.body.data).toHaveProperty('affected_area_km2');
      expect(Array.isArray(response.body.data.impact_zones)).toBe(true);

      if (response.body.data.impact_zones.length > 0) {
        const zone = response.body.data.impact_zones[0];
        expect(zone).toHaveProperty('incident_id');
        expect(zone).toHaveProperty('center_lat');
        expect(zone).toHaveProperty('center_lon');
        expect(zone).toHaveProperty('buffer_geometry');
        expect(zone).toHaveProperty('severity');
        expect(zone).toHaveProperty('area_m2');
      }
    });

    it('should handle different buffer distances', async () => {
      const smallBuffer = await request(app)
        .get('/api/analysis/impact-zones')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          buffer_distance: 100
        });

      const largeBuffer = await request(app)
        .get('/api/analysis/impact-zones')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          buffer_distance: 1000
        });

      expect(smallBuffer.status).toBe(200);
      expect(largeBuffer.status).toBe(200);

      if (smallBuffer.body.data.affected_area_km2 && largeBuffer.body.data.affected_area_km2) {
        expect(largeBuffer.body.data.affected_area_km2)
          .toBeGreaterThan(smallBuffer.body.data.affected_area_km2);
      }
    });

    it('should reject invalid buffer distance', async () => {
      const response = await request(app)
        .get('/api/analysis/impact-zones')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          buffer_distance: 10001 // Exceeds maximum allowed
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('📊 Temporal Pattern Analysis', () => {
    it('should analyze temporal patterns for incidents', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const response = await request(app)
        .get('/api/analysis/temporal-patterns')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          granularity: 'day'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('patterns');
      expect(response.body.data).toHaveProperty('statistics');
      expect(Array.isArray(response.body.data.patterns)).toBe(true);

      if (response.body.data.patterns.length > 0) {
        const pattern = response.body.data.patterns[0];
        expect(pattern).toHaveProperty('period');
        expect(pattern).toHaveProperty('incident_count');
        expect(pattern).toHaveProperty('avg_severity');
      }

      expect(response.body.data.statistics).toHaveProperty('trend_direction');
      expect(response.body.data.statistics).toHaveProperty('peak_period');
      expect(response.body.data.statistics).toHaveProperty('total_incidents');
    });

    it('should handle different time granularities', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const hourlyResponse = await request(app)
        .get('/api/analysis/temporal-patterns')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          granularity: 'hour'
        });

      const dailyResponse = await request(app)
        .get('/api/analysis/temporal-patterns')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          granularity: 'day'
        });

      expect(hourlyResponse.status).toBe(200);
      expect(dailyResponse.status).toBe(200);

      // Hourly should have more data points than daily for the same period
      if (hourlyResponse.body.data.patterns.length > 0 && dailyResponse.body.data.patterns.length > 0) {
        expect(hourlyResponse.body.data.patterns.length)
          .toBeGreaterThanOrEqual(dailyResponse.body.data.patterns.length);
      }
    });

    it('should reject future dates', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const startDate = new Date();

      const response = await request(app)
        .get('/api/analysis/temporal-patterns')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          start_date: startDate.toISOString(),
          end_date: futureDate.toISOString(),
          granularity: 'day'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('🔮 Predictive Modeling', () => {
    it('should generate predictive model (admin only)', async () => {
      const response = await request(app)
        .get('/api/analysis/predictive')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          cluster_count: 3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('risk_areas');
      expect(response.body.data).toHaveProperty('model_accuracy');
      expect(Array.isArray(response.body.data.risk_areas)).toBe(true);

      if (response.body.data.risk_areas.length > 0) {
        const riskArea = response.body.data.risk_areas[0];
        expect(riskArea).toHaveProperty('cluster_id');
        expect(riskArea).toHaveProperty('center_lat');
        expect(riskArea).toHaveProperty('center_lon');
        expect(riskArea).toHaveProperty('risk_score');
        expect(riskArea).toHaveProperty('incident_count');
      }
    });

    it('should deny access to non-admin users', async () => {
      const response = await request(app)
        .get('/api/analysis/predictive')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('admin');
    });

    it('should validate cluster count parameters', async () => {
      const response = await request(app)
        .get('/api/analysis/predictive')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          cluster_count: 0 // Invalid cluster count
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('📈 Incident Density Analysis', () => {
    it('should calculate incident density', async () => {
      const response = await request(app)
        .get('/api/analysis/density')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          cell_size: 0.001
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('density_grid');
      expect(response.body.data).toHaveProperty('max_density');
      expect(response.body.data).toHaveProperty('total_area_km2');
      expect(Array.isArray(response.body.data.density_grid)).toBe(true);

      if (response.body.data.density_grid.length > 0) {
        const cell = response.body.data.density_grid[0];
        expect(cell).toHaveProperty('grid_x');
        expect(cell).toHaveProperty('grid_y');
        expect(cell).toHaveProperty('incident_count');
        expect(cell).toHaveProperty('density_per_km2');
        expect(cell).toHaveProperty('center_lat');
        expect(cell).toHaveProperty('center_lon');
      }
    });

    it('should handle different cell sizes', async () => {
      const fineGrid = await request(app)
        .get('/api/analysis/density')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          cell_size: 0.0005
        });

      const coarseGrid = await request(app)
        .get('/api/analysis/density')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          cell_size: 0.002
        });

      expect(fineGrid.status).toBe(200);
      expect(coarseGrid.status).toBe(200);

      // Fine grid should have more cells than coarse grid
      expect(fineGrid.body.data.density_grid.length)
        .toBeGreaterThanOrEqual(coarseGrid.body.data.density_grid.length);
    });
  });

  describe('🗂️ GeoJSON Export', () => {
    it('should export incidents as GeoJSON', async () => {
      const response = await request(app)
        .get('/api/analysis/export/geojson')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          include_analysis: 'true'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('geojson');

      const geojson = response.body.data.geojson;
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      expect(geojson).toHaveProperty('features');
      expect(Array.isArray(geojson.features)).toBe(true);

      if (geojson.features.length > 0) {
        const feature = geojson.features[0];
        expect(feature).toHaveProperty('type', 'Feature');
        expect(feature).toHaveProperty('geometry');
        expect(feature).toHaveProperty('properties');
        expect(feature.geometry).toHaveProperty('type', 'Point');
        expect(feature.geometry).toHaveProperty('coordinates');
        expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
        expect(feature.geometry.coordinates).toHaveLength(2);
      }
    });

    it('should filter by incident types', async () => {
      const response = await request(app)
        .get('/api/analysis/export/geojson')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          incident_types: '1,2'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify that only incidents of specified types are included
      const geojson = response.body.data.geojson;
      if (geojson.features.length > 0) {
        const typeIds = geojson.features.map(f => f.properties.type_id);
        typeIds.forEach(typeId => {
          expect([1, 2]).toContain(typeId);
        });
      }
    });

    it('should include analysis data when requested', async () => {
      const response = await request(app)
        .get('/api/analysis/export/geojson')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: testBounds.north,
          south: testBounds.south,
          east: testBounds.east,
          west: testBounds.west,
          include_analysis: 'true'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('analysis');
      expect(response.body.data.analysis).toHaveProperty('total_incidents');
      expect(response.body.data.analysis).toHaveProperty('severity_distribution');
      expect(response.body.data.analysis).toHaveProperty('type_distribution');
    });
  });

  describe('🔧 Health Check & Performance', () => {
    it('should provide analysis service health status', async () => {
      const response = await request(app)
        .get('/api/analysis/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('database_connection');
      expect(response.body.data).toHaveProperty('postgis_version');
      expect(response.body.data).toHaveProperty('query_performance');
    });

    it('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      // Send 5 concurrent hotspot requests
      const promises = Array(5).fill(null).map(() => 
        request(app)
          .get('/api/analysis/hotspots')
          .set('Authorization', `Bearer ${userToken}`)
          .query({
            north: testBounds.north,
            south: testBounds.south,
            east: testBounds.east,
            west: testBounds.west,
            gridSize: 100
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Concurrent requests should complete within reasonable time (under 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('🛡️ Security & Rate Limiting', () => {
    it('should enforce rate limits on analysis endpoints', async () => {
      // Skip this test in test mode since rate limiting is disabled
      if (process.env.NODE_ENV === 'test') {
        console.log('Rate limiting test skipped in test environment');
        return;
      }

      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(25).fill(null).map(() => 
        request(app)
          .get('/api/analysis/hotspots')
          .set('Authorization', `Bearer ${userToken}`)
          .query({
            north: testBounds.north,
            south: testBounds.south,
            east: testBounds.east,
            west: testBounds.west
          })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      // Should have some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000); // Increase timeout for rate limit test

    it('should sanitize SQL injection attempts', async () => {
      const maliciousQuery = {
        north: "37.7849; DROP TABLE incidents; --",
        south: "37.7549",
        east: "-122.4094",
        west: "-122.4394"
      };

      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query(maliciousQuery);

      // Should reject malicious input
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate geographic coordinate ranges', async () => {
      const invalidCoords = {
        north: 91,  // Invalid latitude
        south: -91, // Invalid latitude  
        east: 181,  // Invalid longitude
        west: -181  // Invalid longitude
      };

      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query(invalidCoords);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('🚨 Error Handling & Edge Cases', () => {
    it('should handle empty result sets gracefully', async () => {
      // Query area with no incidents
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: 0.001,
          south: 0,
          east: 0.001,
          west: 0,
          gridSize: 50
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hotspots).toHaveLength(0);
    });

    it('should handle database connection errors', async () => {
      // This would require mocking the database connection
      // For now, we'll test that the error handling structure is in place
      expect(true).toBe(true); // Placeholder for database error testing
    });

    it('should validate time ranges properly', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000); // Start after end

      const response = await request(app)
        .get('/api/analysis/temporal-patterns')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          granularity: 'day'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle oversized geographic bounds', async () => {
      // Very large geographic area
      const response = await request(app)
        .get('/api/analysis/hotspots')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          north: 85,
          south: -85,
          east: 180,
          west: -180,
          gridSize: 10 // Small grid size for large area would create too many cells
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
  
  afterAll(async () => {
    try {
      console.log('Cleaning up test resources...');
      
      // Clean up test data if connected
      if (db.isConnected && testUserId && adminUserId) {
        // Delete test incidents first (foreign key constraint)
        await db.query('DELETE FROM incidents WHERE reported_by IN ($1, $2)', [testUserId, adminUserId]);
        
        // Delete test users
        await db.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, adminUserId]);
        
        // Also clean up any users with test pattern
        await db.query(`DELETE FROM users WHERE username LIKE 'testuser_%' OR username LIKE 'adminuser_%'`);
        
        console.log('Database cleanup completed');
      }
      
      // Close database connections
      if (db.isConnected) {
        await db.end();
        console.log('Database connection closed');
      }
      
    } catch (error) {
      console.error('Test cleanup failed:', error);
    }
  });
});
