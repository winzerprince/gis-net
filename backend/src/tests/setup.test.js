/**
 * Basic setup test to verify backend infrastructure
 */

const request = require('supertest');
const { ExpressApp } = require('../app');

describe('Backend Infrastructure Tests', () => {
  let app;
  
  beforeAll(async () => {
    const expressApp = new ExpressApp();
    app = expressApp.getApp();
  });

  test('Health check endpoint should respond', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('version');
  });

  test('API info endpoint should respond', async () => {
    const response = await request(app)
      .get('/api')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('description');
    expect(response.body.name).toBe('GIS-NET Backend API');
  });

  test('Root endpoint should respond', async () => {
    const response = await request(app)
      .get('/')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toBe('GIS-NET Backend API Server');
  });

  test('Unknown route should return 404', async () => {
    const response = await request(app)
      .get('/nonexistent')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Not Found');
  });
});
