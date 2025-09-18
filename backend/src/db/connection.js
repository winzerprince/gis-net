/**
 * ==================================================
 * DATABASE CONNECTION MANAGER
 * PostgreSQL + PostGIS Connection Pool
 * ==================================================
 * 
 * This module manages database connections using a connection pool
 * for optimal performance and resource management. It includes:
 * - Connection pool configuration
 * - PostGIS extension verification
 * - Health check functionality
 * - Graceful shutdown handling
 * - Error logging and monitoring
 */

const { Pool } = require('pg');
const logger = require('../services/logger');

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * Initialize database connection pool
   * @returns {Promise<Pool>} PostgreSQL connection pool
   */
  async initialize() {
    try {
      // Create connection pool with optimized settings
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://winzer:beekeeper@localhost:5432/beehive',
        
        // Connection pool configuration
        max: process.env.NODE_ENV === 'production' ? 20 : 10, // Maximum connections
        min: 2,                                                // Minimum connections
        idleTimeoutMillis: 30000,                             // 30 seconds
        connectionTimeoutMillis: 10000,                       // 10 seconds
        maxUses: 7500,                                        // Max uses per connection
        
        // SSL configuration for production
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        
        // Application name for monitoring
        application_name: 'gis-net-backend',
      });

      // Test initial connection
      const client = await this.pool.connect();
      
      // Verify PostGIS extension
      await this.verifyPostGIS(client);
      
      client.release();
      this.isConnected = true;
      
      logger.info('✅ Database connection established successfully');
      logger.info(`📊 Pool configuration: max=${this.pool.options.max}, min=${this.pool.options.min}`);
      
      // Setup connection event handlers
      this.setupEventHandlers();
      
      return this.pool;
      
    } catch (error) {
      logger.error('❌ Database connection failed:', error.message);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Verify PostGIS extension is available and functional
   * @param {Object} client - PostgreSQL client
   */
  async verifyPostGIS(client) {
    try {
      // Check PostGIS version
      const postgisResult = await client.query('SELECT PostGIS_Version();');
      const postgisVersion = postgisResult.rows[0].postgis_version;
      
      // Check spatial reference systems
      const sridResult = await client.query(
        'SELECT COUNT(*) FROM spatial_ref_sys WHERE srid = 4326;'
      );
      
      if (sridResult.rows[0].count === '0') {
        throw new Error('EPSG:4326 spatial reference system not found');
      }
      
      logger.info(`🗺️  PostGIS ${postgisVersion} verified successfully`);
      logger.info('📍 EPSG:4326 (WGS84) spatial reference system available');
      
    } catch (error) {
      logger.error('❌ PostGIS verification failed:', error.message);
      throw new Error(`PostGIS verification failed: ${error.message}`);
    }
  }

  /**
   * Setup connection pool event handlers for monitoring
   */
  setupEventHandlers() {
    // Connection acquired from pool
    this.pool.on('acquire', () => {
      logger.debug('🔗 Database connection acquired from pool');
    });

    // Connection released back to pool
    this.pool.on('release', () => {
      logger.debug('🔓 Database connection released to pool');
    });

    // Connection removed from pool
    this.pool.on('remove', () => {
      logger.warn('🗑️  Database connection removed from pool');
    });

    // Pool error handling
    this.pool.on('error', (error) => {
      logger.error('💥 Database pool error:', error.message);
    });
  }

  /**
   * Execute a query with automatic connection management
   * @param {string} text - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call initialize() first.');
    }

    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries (> 1000ms)
      if (duration > 1000) {
        logger.warn(`🐌 Slow query detected (${duration}ms): ${text.substring(0, 100)}...`);
      }
      
      return result;
      
    } catch (error) {
      logger.error('❌ Query execution failed:', {
        query: text.substring(0, 100) + '...',
        params: params,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   * @returns {Promise<Object>} PostgreSQL client
   */
  async getClient() {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call initialize() first.');
    }
    
    return await this.pool.connect();
  }

  /**
   * Execute queries within a transaction
   * @param {Function} callback - Function containing transaction queries
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ Transaction rolled back:', error.message);
      throw error;
      
    } finally {
      client.release();
    }
  }

  /**
   * Check database health status
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    try {
      const start = Date.now();
      
      // Basic connectivity test
      const result = await this.query('SELECT NOW() as timestamp, version() as version;');
      const responseTime = Date.now() - start;
      
      // Pool status
      const poolStatus = {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      };
      
      return {
        status: 'healthy',
        timestamp: result.rows[0].timestamp,
        responseTime: `${responseTime}ms`,
        database: {
          version: result.rows[0].version,
          connected: this.isConnected
        },
        pool: poolStatus
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Gracefully close all connections
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      try {
        await this.pool.end();
        this.isConnected = false;
        logger.info('🔒 Database connection pool closed successfully');
      } catch (error) {
        logger.error('❌ Error closing database pool:', error.message);
      }
    }
  }

  /**
   * Backward-compatibility aliases used by some tests/utilities
   * end() and disconnect() both delegate to close()
   */
  async end() {
    return this.close();
  }

  async disconnect() {
    return this.close();
  }

  /**
   * Alias for initialize() to satisfy tests expecting connect()
   */
  async connect() {
    return this.initialize();
  }
}

// Create singleton instance
const db = new DatabaseConnection();

// Export both the singleton (default) and the class constructor for tests
module.exports = db;
module.exports.DatabaseConnection = DatabaseConnection;
