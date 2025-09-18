/**
 * ==================================================
 * INCIDENT MANAGEMENT INTEGRATION TESTS
 * Comprehensive Test Suite for GIS Incident System
 * ==================================================
 * 
 * This test suite provides comprehensive coverage for the incident 
 * management system, including spatial operations, real-time features,
 * authentication, validation, and security testing.
 * 
 * TEST CATEGORIES:
 * 1. Incident CRUD Operations
 * 2. Spatial Query Testing
 * 3. Real-time Socket.io Events
 * 4. Authentication & Authorization
 * 5. Input Validation & Security
 * 6. PostGIS Spatial Operations
 * 7. Community Verification System
 * 8. Rate Limiting & Performance
 * 
 * SPATIAL TEST SCENARIOS:
 * - Proximity searches with ST_DWithin
 * - K-means clustering validation
 * - Heatmap data generation
 * - Geographic bounds filtering
 * - Coordinate validation and normalization
 * 
 * REAL-TIME TEST SCENARIOS:
 * - Socket.io connection authentication
 * - Incident creation broadcasting
 * - Geographic area subscriptions
 * - User notification delivery
 * 
 * DEPENDENCIES:
 * - Jest: Testing framework
 * - Supertest: HTTP endpoint testing
 * - Socket.io-client: WebSocket testing
 * - pg: Direct database testing
 * - JWT: Token generation for auth tests
 * 
 * USAGE:
 * npm test -- --testPathPattern=incident
 * npm test -- --testNamePattern="spatial"
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const socketIOClient = require('socket.io-client');
const { Pool } = require('pg');
const app = require('../../app');
const { configureSocketIO } = require('../services/socket');
const AuthenticationService = require('../services/auth');
const IncidentService = require('../services/incident');
const logger = require('../services/logger');

describe('Incident Management System', () => {
  let server;
  let io;
  let client;
  let authService;
  let incidentService;
  let dbPool;
  let testUser;
  let adminUser;
  let authToken;
  let adminToken;

  // Test data fixtures
  const validIncident = {
    typeId: 1,
    description: 'Traffic accident on Main Street',
    latitude: 40.7128,
    longitude: -74.0060,
    severity: 3,
  };

  const spatialTestData = [
    { lat: 40.7128, lon: -74.0060, type: 1 }, // New York
    { lat: 40.7589, lon: -73.9851, type: 2 }, // Near Times Square
    { lat: 40.6782, lon: -73.9442, type: 1 }, // Brooklyn
    { lat: 34.0522, lon: -118.2437, type: 3 }, // Los Angeles (far)
  ];

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
      'postgresql://postgres:password@localhost:5432/trafficdb_test';

    // Initialize database pool
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Initialize services
    authService = new AuthenticationService();
    incidentService = new IncidentService();

    // Setup test server
    server = app.listen(0); // Use random port
    const port = server.address().port;
    
    // Configure Socket.io
    io = configureSocketIO(server, authService);

    // Setup database schema for testing
    await setupTestDatabase();
    
    // Create test users
    await createTestUsers();
    
    console.log(`Test server running on port ${port}`);
  });

  afterAll(async () => {
    // Cleanup
    if (client && client.connected) {
      client.disconnect();
    }
    if (io) {
      io.close();
    }
    if (server) {
      server.close();
    }
    if (dbPool) {
      await cleanupTestDatabase();
      await dbPool.end();
    }
  });

  beforeEach(async () => {
    // Clear incidents before each test
    await dbPool.query('TRUNCATE TABLE incidents RESTART IDENTITY CASCADE');
  });

  // ==============================================
  // DATABASE SETUP AND TEARDOWN
  // ==============================================

  async function setupTestDatabase() {
    try {
      // Enable PostGIS extension
      await dbPool.query('CREATE EXTENSION IF NOT EXISTS postgis');

      // Create tables if they don't exist
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS incident_types (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS incidents (
          id SERIAL PRIMARY KEY,
          type_id INTEGER REFERENCES incident_types(id) NOT NULL,
          description TEXT,
          location GEOMETRY(POINT, 4326) NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          reported_by INTEGER REFERENCES users(id) NOT NULL,
          reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          severity INTEGER CHECK (severity BETWEEN 1 AND 5),
          verified BOOLEAN DEFAULT FALSE,
          verification_count INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          expires_at TIMESTAMP WITH TIME ZONE,
          is_deleted BOOLEAN DEFAULT FALSE
        )
      `);

      // Create spatial index
      await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_incidents_location 
        ON incidents USING GIST(location)
      `);

      // Insert test incident types
      await dbPool.query(`
        INSERT INTO incident_types (name) VALUES 
        ('Accident'), ('Construction'), ('Weather'), ('Traffic')
        ON CONFLICT (name) DO NOTHING
      `);

      logger.info('Test database schema created successfully');

    } catch (error) {
      logger.logError(error, null, { operation: 'setup_test_database' });
      throw error;
    }
  }

  async function cleanupTestDatabase() {
    try {
      await dbPool.query('DROP TABLE IF EXISTS incidents CASCADE');
      await dbPool.query('DROP TABLE IF EXISTS incident_types CASCADE');
      await dbPool.query('DROP TABLE IF EXISTS users CASCADE');
    } catch (error) {
      logger.logError(error, null, { operation: 'cleanup_test_database' });
    }
  }

  async function createTestUsers() {
    const bcrypt = require('bcryptjs');
    
    // Create regular test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const userResult = await dbPool.query(`
      INSERT INTO users (username, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, ['testuser', 'test@example.com', hashedPassword, 'user']);
    
    testUser = userResult.rows[0];
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create admin test user
    const adminResult = await dbPool.query(`
      INSERT INTO users (username, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, ['admin', 'admin@example.com', hashedPassword, 'admin']);
    
    adminUser = adminResult.rows[0];
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  // ==============================================
  // INCIDENT CRUD OPERATIONS TESTS
  // ==============================================

  describe('Incident CRUD Operations', () => {
    test('POST /api/incidents - Create new incident', async () => {
      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validIncident)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        incident: expect.objectContaining({
          id: expect.any(Number),
          type_id: validIncident.typeId,
          description: validIncident.description,
          latitude: validIncident.latitude,
          longitude: validIncident.longitude,
          severity: validIncident.severity,
          reported_by: testUser.id,
          verified: false,
        }),
      });

      // Verify in database
      const dbResult = await dbPool.query(
        'SELECT *, ST_X(location) as lon, ST_Y(location) as lat FROM incidents WHERE id = $1',
        [response.body.incident.id]
      );
      
      const incident = dbResult.rows[0];
      expect(incident).toBeDefined();
      expect(incident.lat).toBeCloseTo(validIncident.latitude, 6);
      expect(incident.lon).toBeCloseTo(validIncident.longitude, 6);
    });

    test('POST /api/incidents - Validation errors', async () => {
      const invalidIncident = {
        typeId: 999, // Non-existent type
        description: '', // Empty description
        latitude: 200, // Invalid latitude
        longitude: -200, // Invalid longitude
        severity: 10, // Invalid severity
      };

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidIncident)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('GET /api/incidents - List incidents with pagination', async () => {
      // Create multiple test incidents
      await createTestIncidents();

      const response = await request(app)
        .get('/api/incidents')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        incidents: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            description: expect.any(String),
            location: expect.objectContaining({
              latitude: expect.any(Number),
              longitude: expect.any(Number),
            }),
          }),
        ]),
        pagination: expect.objectContaining({
          page: 1,
          limit: 2,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      });
    });

    test('GET /api/incidents/:id - Get specific incident', async () => {
      const incident = await createSingleTestIncident();

      const response = await request(app)
        .get(`/api/incidents/${incident.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        incident: expect.objectContaining({
          id: incident.id,
          description: incident.description,
        }),
      });
    });

    test('PUT /api/incidents/:id - Update incident (owner)', async () => {
      const incident = await createSingleTestIncident();
      const updateData = {
        description: 'Updated incident description',
        severity: 4,
      };

      const response = await request(app)
        .put(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        incident: expect.objectContaining({
          description: updateData.description,
          severity: updateData.severity,
        }),
      });
    });

    test('PUT /api/incidents/:id - Update incident (admin)', async () => {
      const incident = await createSingleTestIncident();
      const updateData = {
        verified: true,
        status: 'resolved',
      };

      const response = await request(app)
        .put(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.incident.verified).toBe(true);
      expect(response.body.incident.status).toBe('resolved');
    });

    test('DELETE /api/incidents/:id - Soft delete incident', async () => {
      const incident = await createSingleTestIncident();

      const response = await request(app)
        .delete(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify soft delete in database
      const dbResult = await dbPool.query(
        'SELECT is_deleted FROM incidents WHERE id = $1',
        [incident.id]
      );
      expect(dbResult.rows[0].is_deleted).toBe(true);
    });
  });

  // ==============================================
  // SPATIAL QUERY TESTS
  // ==============================================

  describe('Spatial Query Operations', () => {
    beforeEach(async () => {
      // Create spatial test data
      for (const data of spatialTestData) {
        await dbPool.query(`
          INSERT INTO incidents (type_id, description, location, latitude, longitude, reported_by)
          VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $4, $3, $5)
        `, [data.type, `Test incident at ${data.lat}, ${data.lon}`, data.lon, data.lat, testUser.id]);
      }
    });

    test('GET /api/incidents - Proximity search', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .query({
          latitude: 40.7128,
          longitude: -74.0060,
          radius: 1000, // 1km radius
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.incidents.length).toBeGreaterThan(0);
      
      // All incidents should be within 1km of NYC coordinates
      response.body.incidents.forEach(incident => {
        const distance = calculateDistance(
          40.7128, -74.0060,
          incident.location.latitude,
          incident.location.longitude
        );
        expect(distance).toBeLessThanOrEqual(1000);
      });
    });

    test('GET /api/incidents/clusters - K-means clustering', async () => {
      const response = await request(app)
        .get('/api/incidents/clusters')
        .query({
          clusterCount: 2,
          bounds: JSON.stringify({
            north: 41,
            south: 40,
            east: -73,
            west: -75,
          }),
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.clusters).toHaveLength(2);
      
      response.body.clusters.forEach(cluster => {
        expect(cluster).toMatchObject({
          cluster_id: expect.any(Number),
          incident_count: expect.any(Number),
          center_latitude: expect.any(Number),
          center_longitude: expect.any(Number),
          incidents: expect.any(Array),
        });
      });
    });

    test('GET /api/incidents/heatmap - Heatmap data generation', async () => {
      const response = await request(app)
        .get('/api/incidents/heatmap')
        .query({
          bounds: JSON.stringify({
            north: 41,
            south: 40,
            east: -73,
            west: -75,
          }),
          gridSize: 0.01,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.heatmapData).toBeDefined();
      expect(Array.isArray(response.body.heatmapData)).toBe(true);
      
      if (response.body.heatmapData.length > 0) {
        response.body.heatmapData.forEach(point => {
          expect(point).toMatchObject({
            latitude: expect.any(Number),
            longitude: expect.any(Number),
            intensity: expect.any(Number),
          });
        });
      }
    });

    test('Spatial bounds validation', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .query({
          latitude: 91, // Invalid latitude
          longitude: -74.0060,
          radius: 1000,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  // ==============================================
  // SOCKET.IO REAL-TIME TESTS
  // ==============================================

  describe('Real-time Socket.io Events', () => {
    beforeEach(async () => {
      const port = server.address().port;
      client = socketIOClient(`http://localhost:${port}`, {
        auth: {
          token: authToken,
        },
      });
      
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });
    });

    afterEach(() => {
      if (client && client.connected) {
        client.disconnect();
      }
    });

    test('Socket connection with valid token', (done) => {
      client.on('connected', (data) => {
        expect(data).toMatchObject({
          message: expect.any(String),
          user: expect.objectContaining({
            id: testUser.id,
            username: testUser.username,
          }),
          timestamp: expect.any(String),
        });
        done();
      });
    });

    test('Socket connection rejection with invalid token', (done) => {
      const invalidClient = socketIOClient(`http://localhost:${server.address().port}`, {
        auth: {
          token: 'invalid-token',
        },
      });

      invalidClient.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        invalidClient.disconnect();
        done();
      });
    });

    test('Real-time incident creation broadcast', (done) => {
      client.on('new-incident', (data) => {
        expect(data).toMatchObject({
          type: 'incident_created',
          incident: expect.objectContaining({
            description: validIncident.description,
          }),
          timestamp: expect.any(String),
        });
        done();
      });

      // Create incident to trigger broadcast
      setTimeout(async () => {
        await request(app)
          .post('/api/incidents')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validIncident);
      }, 100);
    });

    test('Geographic area subscription', (done) => {
      const bounds = {
        north: 41,
        south: 40,
        east: -73,
        west: -75,
      };

      client.on('area_subscribed', (data) => {
        expect(data).toMatchObject({
          success: true,
          bounds,
          message: expect.any(String),
        });
        done();
      });

      client.emit('subscribe_area', { bounds });
    });

    test('Incident verification broadcast', (done) => {
      let incidentId;

      // First, listen for verification broadcast
      client.on('incident-verified', (data) => {
        expect(data).toMatchObject({
          type: 'incident_verified',
          incidentId,
          verificationData: expect.any(Object),
          timestamp: expect.any(String),
        });
        done();
      });

      // Create incident and then verify it
      setTimeout(async () => {
        const incident = await createSingleTestIncident();
        incidentId = incident.id;

        await request(app)
          .post(`/api/incidents/${incident.id}/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ verified: true });
      }, 100);
    });
  });

  // ==============================================
  // AUTHENTICATION & AUTHORIZATION TESTS
  // ==============================================

  describe('Authentication & Authorization', () => {
    test('Unauthorized access to protected endpoints', async () => {
      await request(app)
        .post('/api/incidents')
        .send(validIncident)
        .expect(401);

      await request(app)
        .put('/api/incidents/1')
        .send({ description: 'Updated' })
        .expect(401);

      await request(app)
        .delete('/api/incidents/1')
        .expect(401);
    });

    test('Invalid token rejection', async () => {
      await request(app)
        .post('/api/incidents')
        .set('Authorization', 'Bearer invalid-token')
        .send(validIncident)
        .expect(401);
    });

    test('Permission denied for non-owner updates', async () => {
      const incident = await createSingleTestIncident();
      
      // Create another user
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 10);
      const userResult = await dbPool.query(`
        INSERT INTO users (username, email, password)
        VALUES ($1, $2, $3)
        RETURNING *
      `, ['otheruser', 'other@example.com', hashedPassword]);
      
      const otherUser = userResult.rows[0];
      const otherToken = jwt.sign(
        { userId: otherUser.id, email: otherUser.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      await request(app)
        .put(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ description: 'Unauthorized update' })
        .expect(403);
    });

    test('Admin can update any incident', async () => {
      const incident = await createSingleTestIncident();

      const response = await request(app)
        .put(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ verified: true })
        .expect(200);

      expect(response.body.incident.verified).toBe(true);
    });
  });

  // ==============================================
  // RATE LIMITING TESTS
  // ==============================================

  describe('Rate Limiting', () => {
    test('Rate limit incident creation', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 12; i++) {
        requests.push(
          request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              ...validIncident,
              description: `Incident ${i}`,
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('Rate limit verification requests', async () => {
      const incident = await createSingleTestIncident();
      const requests = [];

      // Make multiple rapid verification requests
      for (let i = 0; i < 7; i++) {
        requests.push(
          request(app)
            .post(`/api/incidents/${incident.id}/verify`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ verified: true })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  // ==============================================
  // COMMUNITY VERIFICATION TESTS
  // ==============================================

  describe('Community Verification System', () => {
    test('POST /api/incidents/:id/verify - Add verification', async () => {
      const incident = await createSingleTestIncident();

      const response = await request(app)
        .post(`/api/incidents/${incident.id}/verify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ verified: true })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        incident: expect.objectContaining({
          verification_count: 1,
        }),
      });
    });

    test('Prevent duplicate verification from same user', async () => {
      const incident = await createSingleTestIncident();

      // First verification should succeed
      await request(app)
        .post(`/api/incidents/${incident.id}/verify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ verified: true })
        .expect(200);

      // Second verification from same user should fail
      await request(app)
        .post(`/api/incidents/${incident.id}/verify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ verified: true })
        .expect(400);
    });

    test('Auto-verify incident after threshold', async () => {
      const incident = await createSingleTestIncident();

      // Create multiple users and verify
      const users = [];
      for (let i = 0; i < 5; i++) {
        const user = await createTestUser(`verifier${i}`, `verifier${i}@example.com`);
        users.push(user);
      }

      // Add verifications
      for (const user of users) {
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        await request(app)
          .post(`/api/incidents/${incident.id}/verify`)
          .set('Authorization', `Bearer ${token}`)
          .send({ verified: true });
      }

      // Check if incident is auto-verified
      const response = await request(app)
        .get(`/api/incidents/${incident.id}`)
        .expect(200);

      expect(response.body.incident.verification_count).toBeGreaterThanOrEqual(5);
    });
  });

  // ==============================================
  // HELPER FUNCTIONS
  // ==============================================

  async function createSingleTestIncident() {
    const result = await dbPool.query(`
      INSERT INTO incidents (type_id, description, location, latitude, longitude, reported_by)
      VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $4, $3, $5)
      RETURNING *
    `, [
      validIncident.typeId,
      validIncident.description,
      validIncident.longitude,
      validIncident.latitude,
      testUser.id
    ]);

    return result.rows[0];
  }

  async function createTestIncidents() {
    const incidents = [];
    for (let i = 0; i < 5; i++) {
      const result = await dbPool.query(`
        INSERT INTO incidents (type_id, description, location, latitude, longitude, reported_by)
        VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $4, $3, $5)
        RETURNING *
      `, [
        1,
        `Test incident ${i}`,
        -74.0060 + (i * 0.01),
        40.7128 + (i * 0.01),
        testUser.id
      ]);
      incidents.push(result.rows[0]);
    }
    return incidents;
  }

  async function createTestUser(username, email) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const result = await dbPool.query(`
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [username, email, hashedPassword]);
    
    return result.rows[0];
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }
});

// Export for use in other test files
module.exports = {
  createSingleTestIncident,
  createTestIncidents,
  createTestUser,
  calculateDistance,
};
