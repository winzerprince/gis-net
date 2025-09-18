/**
 * App adapter for tests and simple imports.
 * Exports an Express app instance and exposes the ExpressApp class for advanced usage.
 *
 * Dependencies: ./src/app
 * Inputs: optional environment via process.env
 * Outputs: module.exports = express app instance; module.exports.ExpressApp = class
 */
const ExpressApp = require('./src/app');

// Create an Express application instance in test-friendly mode
const expressApp = new ExpressApp({ isTestMode: process.env.NODE_ENV === 'test' });

// Export the raw Express app for supertest compatibility
module.exports = expressApp.getApp();

// Also expose the class for tests that need to instantiate manually
module.exports.ExpressApp = ExpressApp;
