/**
 * ==================================================
 * MIGRATION SKIP SCRIPT
 * Marks migrations as completed without running them
 * ==================================================
 * 
 * This script is useful when migrations have been applied manually
 * or when you need to skip problematic migrations.
 */

require('dotenv').config();
const db = require('./connection');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../services/logger');

async function markMigrationsAsCompleted(filenames = null) {
  try {
    await db.initialize();

    // Create migration table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL,
        execution_time INTEGER NOT NULL
      );
    `);
    
    // Get all migration files if not specified
    let migrationFiles = filenames;
    if (!migrationFiles) {
      const migrationsDir = path.join(__dirname, 'init');
      migrationFiles = await fs.readdir(migrationsDir);
      migrationFiles = migrationFiles.filter(file => file.endsWith('.sql'));
    }
    
    if (Array.isArray(migrationFiles) && migrationFiles.length === 0) {
      console.log('No migration files found to mark as completed.');
      return;
    }
    
    // Mark each migration as completed
    for (const filename of migrationFiles) {
      // Generate a placeholder checksum
      const checksum = crypto.createHash('sha256').update(`skipped_${filename}`).digest('hex').substring(0, 16);
      
      await db.query(
        'INSERT INTO schema_migrations (filename, checksum, execution_time) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
        [filename, checksum, 0]
      );
      
      console.log(`✅ Marked migration as completed: ${filename}`);
    }
    
    console.log('✅ All specified migrations marked as completed');
  } catch (error) {
    console.error('❌ Failed to mark migrations as completed:', error.message);
  } finally {
    await db.close();
  }
}

// When run directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const filenames = args.length > 0 ? args : null;
  
  markMigrationsAsCompleted(filenames)
    .then(() => console.log('Done'))
    .catch(console.error);
}

module.exports = { markMigrationsAsCompleted };
