/**
 * ==================================================
 * DATABASE MIGRATION MANAGER
 * Automated Schema Management System
 * ==================================================
 * 
 * This module handles database migrations for the GIS-NET system:
 * - Automatic migration execution on startup
 * - Version tracking and rollback support
 * - PostGIS extension management
 * - Development vs. production migration strategies
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const db = require('./connection');
const logger = require('../services/logger');

class MigrationManager {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'init');
    this.migrationTable = 'schema_migrations';
  }

  /**
   * Initialize migration system
   * Creates migration tracking table if it doesn't exist
   */
  async initialize() {
    try {
      await db.initialize();
      
      // Create migration tracking table
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL,
          execution_time INTEGER NOT NULL
        );
      `);
      
      logger.info('🔄 Migration system initialized');
      return true;
      
    } catch (error) {
      logger.error('❌ Migration system initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    try {
      logger.info('🚀 Starting database migrations...');
      
      // Get list of migration files
      const migrationFiles = await this.getMigrationFiles();
      
      if (migrationFiles.length === 0) {
        logger.info('📝 No migration files found');
        return;
      }
      
      // Get already executed migrations
      const executedMigrations = await this.getExecutedMigrations();
      
      // Filter pending migrations
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('✅ All migrations are up to date');
        return;
      }
      
      logger.info(`📋 Found ${pendingMigrations.length} pending migrations`);
      
      // Execute pending migrations in transaction
      for (const migrationFile of pendingMigrations) {
        await this.executeMigration(migrationFile);
      }
      
      logger.info('🎉 All migrations completed successfully');
      
    } catch (error) {
      logger.error('❌ Migration execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Get list of migration files sorted by name
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      
      return files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensures proper execution order (01-init, 02-seed, etc.)
        
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('📁 Migration directory not found, skipping migrations');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get list of already executed migrations
   */
  async getExecutedMigrations() {
    try {
      const result = await db.query(
        `SELECT filename FROM ${this.migrationTable} ORDER BY executed_at`
      );
      
      return result.rows.map(row => row.filename);
      
    } catch (error) {
      logger.warn('⚠️  Could not fetch executed migrations:', error.message);
      return [];
    }
  }

  /**
   * Execute a single migration file
   */
  async executeMigration(filename) {
    const startTime = Date.now();
    
    try {
      logger.info(`🔄 Executing migration: ${filename}`);
      
      // Read migration file
      const filePath = path.join(this.migrationsDir, filename);
      const migrationSQL = await fs.readFile(filePath, 'utf8');
      
      // Calculate checksum for integrity verification
      const checksum = this.calculateChecksum(migrationSQL);
      
      // Execute migration in transaction
      await db.transaction(async (client) => {
        // Execute the migration SQL
        await client.query(migrationSQL);
        
        // Record migration execution
        const executionTime = Date.now() - startTime;
        await client.query(
          `INSERT INTO ${this.migrationTable} (filename, checksum, execution_time) VALUES ($1, $2, $3)`,
          [filename, checksum, executionTime]
        );
      });
      
      const duration = Date.now() - startTime;
      logger.info(`✅ Migration completed: ${filename} (${duration}ms)`);
      
    } catch (error) {
      logger.error(`❌ Migration failed: ${filename}`, error.message);
      throw new Error(`Migration ${filename} failed: ${error.message}`);
    }
  }

  /**
   * Calculate SHA-256 checksum of migration content
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(content, 'utf8')
      .digest('hex')
      .substring(0, 16); // First 16 chars for brevity
  }

  /**
   * Verify database schema integrity
   */
  async verifySchema() {
    try {
      logger.info('🔍 Verifying database schema integrity...');
      
      // Check required tables exist
      const requiredTables = [
        'users', 'incident_types', 'incidents', 
        'incident_reports', 'audit_logs'
      ];
      
      const result = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = ANY($1)
      `, [requiredTables]);
      
      const existingTables = result.rows.map(row => row.table_name);
      const missingTables = requiredTables.filter(
        table => !existingTables.includes(table)
      );
      
      if (missingTables.length > 0) {
        throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
      }
      
      // Verify PostGIS extension
      const postgisResult = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'postgis'
        ) as postgis_installed
      `);
      
      if (!postgisResult.rows[0].postgis_installed) {
        throw new Error('PostGIS extension not installed');
      }
      
      // Check spatial indexes
      const spatialIndexResult = await db.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'incidents' 
          AND indexname LIKE '%location%'
      `);
      
      if (spatialIndexResult.rows.length === 0) {
        throw new Error('Spatial indexes not found on incidents table');
      }
      
      logger.info('✅ Database schema verification passed');
      return true;
      
    } catch (error) {
      logger.error('❌ Schema verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Get migration status and statistics
   */
  async getStatus() {
    try {
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      const pending = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );
      
      // Get execution statistics
      const statsResult = await db.query(`
        SELECT 
          COUNT(*) as total_migrations,
          AVG(execution_time) as avg_execution_time,
          MAX(executed_at) as last_migration
        FROM ${this.migrationTable}
      `);
      
      const stats = statsResult.rows[0];
      
      return {
        total_files: migrationFiles.length,
        executed: executedMigrations.length,
        pending: pending.length,
        pending_files: pending,
        statistics: {
          total_migrations: parseInt(stats.total_migrations) || 0,
          average_execution_time: parseFloat(stats.avg_execution_time) || 0,
          last_migration: stats.last_migration
        }
      };
      
    } catch (error) {
      logger.error('❌ Could not get migration status:', error.message);
      return null;
    }
  }

  /**
   * Reset database (development only)
   * WARNING: This will drop all tables and data
   */
  async reset() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset not allowed in production environment');
    }
    
    try {
      logger.warn('⚠️  Resetting database - ALL DATA WILL BE LOST!');
      
      // Drop all tables in reverse dependency order
      await db.query(`
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS incident_reports CASCADE;
        DROP TABLE IF EXISTS incidents CASCADE;
        DROP TABLE IF EXISTS incident_types CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS ${this.migrationTable} CASCADE;
        
        DROP MATERIALIZED VIEW IF EXISTS incident_clusters CASCADE;
        
        DROP TYPE IF EXISTS user_role CASCADE;
        DROP TYPE IF EXISTS incident_status CASCADE;
      `);
      
      logger.warn('🗑️  Database reset completed');
      
      // Re-run migrations
      await this.initialize();
      await this.runMigrations();
      
    } catch (error) {
      logger.error('❌ Database reset failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const migrationManager = new MigrationManager();

module.exports = migrationManager;
