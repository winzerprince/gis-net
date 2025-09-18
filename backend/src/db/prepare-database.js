/**
 * ==================================================
 * DATABASE PREPARATION SCRIPT
 * Sets up PostgreSQL extensions and permissions
 * ==================================================
 * 
 * This script should be run as a PostgreSQL superuser to:
 * 1. Create necessary extensions (PostGIS)
 * 2. Grant proper permissions to the application user
 */

require('dotenv').config();
const { Client } = require('pg');
const logger = require('../services/logger');

async function prepareDatabase() {
  // Connect as superuser - MUST BE RUN AS POSTGRES SUPERUSER
  const client = new Client({
    user: 'postgres',      // Superuser
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'beehive',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('Connected as superuser to prepare database');
    
    // Create extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('✅ PostGIS extension created');
    
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis_topology;');
    console.log('✅ PostGIS topology extension created');
    
    // Grant permissions to application user
    const appUser = process.env.DB_USER || 'winzer';
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${process.env.DB_NAME || 'beehive'} TO ${appUser};`);
    await client.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${appUser};`);
    await client.query(`GRANT USAGE ON SCHEMA topology TO ${appUser};`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA topology TO ${appUser};`);
    console.log(`✅ Permissions granted to application user ${appUser}`);
    
    console.log('✅ Database preparation complete');
  } catch (error) {
    console.error('❌ Database preparation failed:', error.message);
  } finally {
    await client.end();
  }
}

// Run if executed directly
if (require.main === module) {
  prepareDatabase().catch(console.error);
}

module.exports = { prepareDatabase };
