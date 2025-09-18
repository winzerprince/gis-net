/**
 * Simple Incident Types Seeder
 * Populates the incident_types table with basic traffic incident categories
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://winzer:beekeeper@localhost:5432/beehive',
});

const incidentTypes = [
  'Accident',
  'Construction',
  'Weather',
  'Traffic Jam',
  'Road Closure',
  'Vehicle Breakdown',
  'Hazard',
  'Emergency',
  'Police Activity',
  'Fire Department',
  'Medical Emergency',
  'Flooding',
  'Ice/Snow',
  'Debris',
  'Signal Outage',
  'Road Work',
  'Lane Closure',
  'Detour',
  'Pedestrian Incident',
  'Bicycle Incident'
];

async function seedIncidentTypes() {
  try {
    console.log('🌱 Starting incident types seeding...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connected');
    
    // Clear existing types
    await client.query('DELETE FROM incident_types');
    console.log('🗑️  Cleared existing incident types');
    
    // Insert new types
    for (const typeName of incidentTypes) {
      await client.query(
        'INSERT INTO incident_types (name) VALUES ($1)',
        [typeName]
      );
    }
    
    // Verify insertion
    const result = await client.query('SELECT COUNT(*) as count FROM incident_types');
    const count = parseInt(result.rows[0].count);
    
    client.release();
    
    console.log(`✅ Successfully seeded ${count} incident types`);
    
    // List all types
    const listClient = await pool.connect();
    const listResult = await listClient.query('SELECT id, name FROM incident_types ORDER BY id');
    
    console.log('\n📋 Seeded incident types:');
    listResult.rows.forEach(row => {
      console.log(`  ${row.id}: ${row.name}`);
    });
    
    listClient.release();
    
  } catch (error) {
    console.error('❌ Error seeding incident types:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔚 Database connection closed');
  }
}

// Run the seeder
if (require.main === module) {
  seedIncidentTypes();
}

module.exports = { seedIncidentTypes };
