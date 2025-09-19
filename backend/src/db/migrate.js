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
  this.extraMigrationsDir = path.join(__dirname, 'migrations');
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
      const initFiles = await fs.readdir(this.migrationsDir).catch(err => (err.code === 'ENOENT' ? [] : Promise.reject(err)));
      const extraFiles = await fs.readdir(this.extraMigrationsDir).catch(err => (err.code === 'ENOENT' ? [] : Promise.reject(err)));
      const files = [...initFiles.map(f => ({ f, dir: 'init' })), ...extraFiles.map(f => ({ f, dir: 'migrations' }))];

      return files
        .filter(file => file.f.endsWith('.sql'))
        .sort((a, b) => a.f.localeCompare(b.f))
        .map(entry => path.join(__dirname, entry.dir, entry.f)); // Full paths for execution
        
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
  const baseName = path.basename(filename);
  logger.info(`🔄 Executing migration: ${baseName}`);
      
      // Read migration file
  let migrationSQL = await fs.readFile(filename, 'utf8');
      
      // No SQL cleaning for 01-init-schema.sql since it works perfectly with psql
      // Only clean files that actually have problematic psql commands
      if (baseName.includes('seed-data.sql') || baseName.includes('auth-tables.sql')) {
        // Clean up psql-specific commands only for files that need it
        migrationSQL = migrationSQL
          .replace(/^\\echo\s+.*$/gm, '')
          .replace(/^\\set\s+.*$/gm, '')
          .replace(/^\\connect\s+.*$/gm, '')
          .replace(/^\\.*$/gm, '')  // Remove any other backslash commands
          .replace(/^\s*$/gm, '')   // Remove empty lines
          .replace(/\n\n+/g, '\n'); // Clean up multiple newlines
      }
      
      // Calculate checksum for integrity verification
      const checksum = this.calculateChecksum(migrationSQL);
      
      // Execute migration in transaction
      try {
        // Since the SQL file works perfectly with psql but fails with client.query(),
        // let's use psql command line tool to execute the migration
        logger.debug(`Executing migration using psql command line tool...`);
        
        const { spawn } = require('child_process');
        const fs = require('fs');
        
        try {
          // Execute migration using psql command line tool
          const psqlArgs = [
            '-h', process.env.DB_HOST || 'localhost',
            '-U', process.env.DB_USER || 'postgres', 
            '-d', process.env.DB_NAME || 'trafficdb',
            '-f', filename,  // Execute file directly
            '-q'  // Quiet mode, only show errors
          ];
          
          logger.debug(`Running: psql ${psqlArgs.join(' ')}`);
          
          const psqlProcess = spawn('psql', psqlArgs, {
            stdio: ['inherit', 'pipe', 'pipe']
          });
          
          let stdout = '';
          let stderr = '';
          
          psqlProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          psqlProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          const exitCode = await new Promise((resolve) => {
            psqlProcess.on('close', resolve);
          });
          
          if (exitCode !== 0) {
            logger.error(`psql stderr: ${stderr}`);
            throw new Error(`psql exited with code ${exitCode}: ${stderr}`);
          }
          
          logger.debug(`psql stdout: ${stdout}`);
          
          // Record migration execution manually
          const client = await db.pool.connect();
          
          try {
            
            // Record migration execution in migration table
            const executionTime = Date.now() - startTime;
            
            // Create migration table if it doesn't exist and record this migration
            await client.query(`
              CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(64) NOT NULL,
                execution_time INTEGER NOT NULL
              )
            `);
            
            await client.query(
              `INSERT INTO ${this.migrationTable} (filename, checksum, execution_time) VALUES ($1, $2, $3) 
               ON CONFLICT (filename) DO NOTHING`,
              [baseName, checksum, executionTime]
            );
            
            logger.debug(`Migration ${baseName} executed successfully`);
            
          } finally {
            client.release();
          }
          
        } catch (err) {
          // Log detailed SQL error
          logger.error(`SQL Error in migration ${filename}: ${err.message}`);
          logger.error(`Statement: ${err.query || 'Unknown'}`);
          logger.error(`Position: ${err.position || 'Unknown'}`);
          
          // For debugging, let's also log the character at the error position
          if (err.position) {
            const pos = parseInt(err.position);
            if (pos > 0 && pos <= migrationSQL.length) {
              const errorContext = migrationSQL.substring(Math.max(0, pos - 50), pos + 50);
              logger.error(`Error context: ...${errorContext}...`);
              logger.error(`Character at position ${pos}: "${migrationSQL.charAt(pos - 1)}"`);
            }
          }
          
          throw new Error(`Migration ${filename} failed: ${err.message}`);
        }
      } catch (error) {
        // This will be caught by the outer try/catch
        throw new Error(`Migration ${filename} failed: ${error.message}`);
      }
      
      const duration = Date.now() - startTime;
  logger.info(`✅ Migration completed: ${baseName} (${duration}ms)`);
      
    } catch (error) {
  const baseName = path.basename(filename);
  logger.error(`❌ Migration failed: ${baseName}`, error.message);
  throw new Error(`Migration ${baseName} failed: ${error.message}`);
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
      
      // Core tables that must exist after initial migration
      const coreTables = ['users', 'incident_types', 'incidents'];
      
      const result = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = ANY($1)
      `, [coreTables]);
      
      const existingTables = result.rows.map(row => row.table_name);
      const missingTables = coreTables.filter(
        table => !existingTables.includes(table)
      );
      
      if (missingTables.length > 0) {
        throw new Error(`Missing core tables: ${missingTables.join(', ')}`);
      }
      
      // Verify PostGIS extension
      const postgisResult = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'postgis'
        ) as postgis_installed
      `);
      
      if (!postgisResult.rows[0].postgis_installed) {
        logger.warn('⚠️ PostGIS extension not detected - attempting to create it');
        
        // Try to create PostGIS extension if missing
        try {
          await db.query('CREATE EXTENSION IF NOT EXISTS postgis;');
          logger.info('✅ PostGIS extension installed successfully');
        } catch (err) {
          logger.error('❌ Failed to create PostGIS extension. Run as superuser: CREATE EXTENSION postgis;');
          throw new Error(`PostGIS extension installation failed: ${err.message}`);
        }
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
