/**
 * Shim module to satisfy tests expecting '../src/app'.
 * Re-exports the ExpressApp class from the real app module.
 *
 * Dependencies: ./../app
 * Inputs: N/A
 * Outputs: ExpressApp class export
 */
module.exports = require('../app');
