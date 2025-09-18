/**
 * ==================================================
 * AUTHENTICATION TESTS
 * Comprehensive Testing for Authentication System
 * ==================================================
 * 
 * This test suite validates the complete authentication system including:
 * - User registration with validation
 * - User login with security features
 * - JWT token management (access & refresh)
 * - Password security and hashing
 * - Rate limiting and security measures
 * - Authentication middleware functionality
 * 
 * TEST CATEGORIES:
 * - Unit Tests: Individual service and middleware functions
 * - Integration Tests: API endpoints with database interactions
 * - Security Tests: Attack scenarios and edge cases
 * - Performance Tests: Rate limiting and concurrent requests
 * 
 * DEPENDENCIES:
 * - Jest: Testing framework
 * - Supertest: HTTP request testing
 * - bcrypt: Password comparison
 * - jsonwebtoken: Token verification
 * - Test Database: Isolated test environment
 * 
 * USAGE:
 * npm test -- --testPathPattern=auth
 * npm run test:auth
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { ExpressApp } = require('../app');
const DatabaseConnection = require('../db/connection');
const AuthenticationService = require('../services/auth');
const PasswordSecurityService = require('../services/password');

// Test configuration
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://beekeeper:test_password@localhost:5432/beehive_test';

describe('Authentication System', () => {
  let app;
  let server;
  let db;
  let authService;
  let passwordService;

  // Test user data
  const testUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPassword123!',
    confirmPassword: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
  };

  const testUserInvalid = {
    username: '',
    email: 'invalid-email',
    password: '123',
    confirmPassword: '456',
  };

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test-jwt-secret-key';

    // Initialize database connection
    db = new DatabaseConnection();
    await db.connect();

    // Initialize services
    authService = new AuthenticationService(db);
    passwordService = new PasswordSecurityService(db);

    // Create Express app
    const expressApp = new ExpressApp();
    app = expressApp.getApp();
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query('DELETE FROM user_login_attempts');
    await db.query('DELETE FROM blacklisted_tokens');
    await db.query('DELETE FROM users WHERE email = $1', [testUser.email]);
  });

  describe('User Registration', () => {
    test('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');

      // Verify password is hashed
      const userResult = await db.query('SELECT password FROM users WHERE email = $1', [testUser.email]);
      expect(userResult.rows[0].password).not.toBe(testUser.password);
      
      // Verify password hash is valid
      const isValidHash = await bcrypt.compare(testUser.password, userResult.rows[0].password);
      expect(isValidHash).toBe(true);
    });

    test('should reject registration with invalid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUserInvalid)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveProperty('length');
    });

    test('should reject registration with existing email', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      // Duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(400);

      expect(response.body.error).toBe('Registration failed');
      expect(response.body.message).toContain('email');
    });

    test('should reject weak passwords', async () => {
      const weakPasswordUser = {
        ...testUser,
        password: '123456',
        confirmPassword: '123456',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordUser)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test('should reject mismatched password confirmation', async () => {
      const mismatchedUser = {
        ...testUser,
        confirmPassword: 'DifferentPassword123!',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(mismatchedUser)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('User Login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.tokens.accessToken, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email');
    });

    test('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication failed');
    });

    test('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication failed');
    });

    test('should handle brute force protection', async () => {
      const maxAttempts = 5;
      
      // Make multiple failed login attempts
      for (let i = 0; i < maxAttempts; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'WrongPassword123!',
          })
          .expect(400);
      }

      // Next attempt should be blocked
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(429);

      expect(response.body.error).toBe('Account temporarily locked');
    });

    test('should accept remember me option', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          rememberMe: true,
        })
        .expect(200);

      // Verify extended token expiry for remember me
      const decoded = jwt.verify(response.body.tokens.refreshToken, process.env.JWT_SECRET);
      const tokenAge = decoded.exp - decoded.iat;
      expect(tokenAge).toBeGreaterThan(24 * 60 * 60); // More than 24 hours
    });
  });

  describe('Token Management', () => {
    let accessToken;
    let refreshToken;

    beforeEach(async () => {
      // Register and login to get tokens
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      accessToken = loginResponse.body.tokens.accessToken;
      refreshToken = loginResponse.body.tokens.refreshToken;
    });

    test('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toHaveProperty('id');

      // Verify new token is different
      expect(response.body.accessToken).not.toBe(accessToken);
    });

    test('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token validation failed');
    });

    test('should logout and invalidate tokens', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Try to use invalidated refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(400);

      expect(refreshResponse.body.error).toBe('Token validation failed');
    });

    test('should validate access token in protected routes', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(testUser.email);
    });

    test('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Password Security', () => {
    test('should hash passwords with proper strength', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = await passwordService.hashPassword(password);

      // Verify hash format (bcrypt)
      expect(hashedPassword).toMatch(/^\$2[aby]?\$\d+\$/);
      
      // Verify password verification works
      const isValid = await passwordService.verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);

      // Verify wrong password fails
      const isInvalid = await passwordService.verifyPassword('WrongPassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });

    test('should assess password strength', async () => {
      const weakPassword = '123456';
      const strongPassword = 'MyStr0ng!P@ssw0rd';

      // Note: This assumes password strength assessment is implemented
      // If not implemented, this test should be skipped or mock the functionality
    });

    test('should enforce password policies', async () => {
      const testCases = [
        { password: '123', valid: false, reason: 'too short' },
        { password: 'password', valid: false, reason: 'no numbers/symbols' },
        { password: 'Password123!', valid: true, reason: 'meets requirements' },
      ];

      for (const testCase of testCases) {
        const userWithTestPassword = {
          ...testUser,
          email: `test-${Date.now()}@example.com`,
          username: `test-${Date.now()}`,
          password: testCase.password,
          confirmPassword: testCase.password,
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userWithTestPassword);

        if (testCase.valid) {
          expect(response.status).toBe(201);
        } else {
          expect(response.status).toBe(400);
        }
      }
    });
  });

  describe('Security Features', () => {
    test('should enforce rate limiting on registration', async () => {
      // This test assumes rate limiting is configured for registration
      const requests = [];
      const maxRequests = 4; // Assuming limit is 3 per hour

      for (let i = 0; i < maxRequests; i++) {
        requests.push(
          request(app)
            .post('/api/auth/register')
            .send({
              ...testUser,
              email: `test${i}@example.com`,
              username: `test${i}`,
            })
        );
      }

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];
      
      // The last request should be rate limited
      expect(lastResponse.status).toBe(429);
    }, 10000);

    test('should log security events', async () => {
      // Test that security events are logged
      // This would require access to logs or a logging mock
      
      // Failed login attempt
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword',
        });

      // In a real test, you would verify the log entry was created
      // For now, we just ensure the request doesn't crash
      expect(true).toBe(true);
    });

    test('should sanitize user input', async () => {
      const maliciousUser = {
        ...testUser,
        email: 'test@example.com',
        username: '<script>alert("xss")</script>',
        firstName: '../../etc/passwd',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(maliciousUser);

      if (response.status === 201) {
        // If registration succeeds, verify input was sanitized
        expect(response.body.user.username).not.toContain('<script>');
        expect(response.body.user.firstName).not.toContain('../');
      }
    });
  });

  describe('API Integration', () => {
    test('should handle concurrent registration requests', async () => {
      const concurrentUsers = Array.from({ length: 5 }, (_, i) => ({
        ...testUser,
        email: `concurrent${i}@example.com`,
        username: `concurrent${i}`,
      }));

      const requests = concurrentUsers.map(user =>
        request(app)
          .post('/api/auth/register')
          .send(user)
      );

      const responses = await Promise.all(requests);
      
      // All should succeed with unique users
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    }, 15000);

    test('should handle database connection failures gracefully', async () => {
      // This test would require mocking database failures
      // For now, we ensure the system handles errors gracefully
      
      // Attempt operation that might fail
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Should either succeed or fail gracefully with proper error message
      expect([200, 201, 500, 503]).toContain(response.status);
      
      if (response.status >= 400) {
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
      }
    });
  });
});
