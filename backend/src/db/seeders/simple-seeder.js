/**
 * Simple Incident Types Seeder
 * Basic seeder for incident types compatible with current schema
 */

require('dotenv').config();
const logger = require('../../services/logger');
const db = require('../connection');

class SimpleIncidentTypeSeeder {
  constructor() {
    this.db = db;
    this.incidentTypes = [
      { name: 'Vehicle Collision', description: 'Motor vehicle accident involving one or more vehicles', icon: 'car-crash', color: '#ff4444', priority: 4 },
      { name: 'Vehicle Breakdown', description: 'Disabled or broken-down vehicle blocking traffic', icon: 'car-breakdown', color: '#ff8800', priority: 2 },
      { name: 'Pedestrian Incident', description: 'Incident involving pedestrians on or near roadway', icon: 'pedestrian', color: '#cc0000', priority: 5 },
      { name: 'Road Construction', description: 'Active construction work affecting traffic flow', icon: 'construction', color: '#ffaa00', priority: 2 },
      { name: 'Lane Closure', description: 'One or more lanes temporarily closed', icon: 'lane-closed', color: '#ff6600', priority: 3 },
      { name: 'Road Maintenance', description: 'Routine maintenance work affecting traffic', icon: 'maintenance', color: '#ffcc00', priority: 2 },
      { name: 'Flooding', description: 'Road flooding making passage difficult or impossible', icon: 'flood', color: '#0066cc', priority: 4 },
      { name: 'Ice/Snow Conditions', description: 'Hazardous winter weather conditions', icon: 'snow', color: '#4488cc', priority: 3 },
      { name: 'Poor Visibility', description: 'Fog, heavy rain, or other visibility-reducing conditions', icon: 'fog', color: '#888888', priority: 3 },
      { name: 'Traffic Signal Malfunction', description: 'Traffic light or signal system not working properly', icon: 'traffic-light', color: '#ffaa44', priority: 3 },
      { name: 'Road Closure', description: 'Complete road closure preventing passage', icon: 'road-closed', color: '#cc0000', priority: 5 },
      { name: 'Detour in Effect', description: 'Traffic being redirected via alternate route', icon: 'detour', color: '#ff9900', priority: 3 },
      { name: 'Police Activity', description: 'Law enforcement activity affecting traffic', icon: 'police', color: '#0044cc', priority: 3 },
      { name: 'Fire Department Activity', description: 'Fire department response affecting roadway', icon: 'fire-truck', color: '#cc4400', priority: 4 },
      { name: 'Medical Emergency', description: 'Ambulance or medical response on roadway', icon: 'ambulance', color: '#cc0044', priority: 3 },
      { name: 'Pothole/Road Damage', description: 'Pavement damage creating driving hazard', icon: 'pothole', color: '#666666', priority: 2 },
      { name: 'Bridge Issues', description: 'Bridge closure or weight restrictions', icon: 'bridge', color: '#8844aa', priority: 4 },
      { name: 'Utility Work', description: 'Gas, electric, or water utility work affecting traffic', icon: 'utility', color: '#aa8800', priority: 2 },
      { name: 'Debris on Road', description: 'Objects or debris blocking or affecting traffic', icon: 'debris', color: '#996633', priority: 3 },
      { name: 'Animal on Roadway', description: 'Animals creating traffic hazard', icon: 'animal', color: '#228844', priority: 2 },
      { name: 'Stalled Vehicle', description: 'Vehicle stopped in travel lane or shoulder', icon: 'stalled', color: '#ff6666', priority: 2 }
    ];
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      if (!this.db.pool) {
        await this.db.initialize();
      }
      logger.info('SimpleIncidentTypeSeeder: Database connection ready');
      return true;
    } catch (error) {
      logger.error('SimpleIncidentTypeSeeder: Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Clear existing incident types
   */
  async clearExistingTypes() {
    try {
      logger.info('SimpleIncidentTypeSeeder: Clearing existing incident types');
      
      // First delete related records to avoid foreign key constraints
      await this.db.query('DELETE FROM incidents WHERE type_id IS NOT NULL');
      await this.db.query('DELETE FROM incident_types');
      
      logger.info('SimpleIncidentTypeSeeder: Existing types cleared');
      return true;
    } catch (error) {
      logger.error('SimpleIncidentTypeSeeder: Failed to clear existing types:', error.message);
      throw error;
    }
  }

  /**
   * Seed incident types
   */
  async seedIncidentTypes() {
    try {
      logger.info('SimpleIncidentTypeSeeder: Starting incident type seeding');
      
      const insertQuery = `
        INSERT INTO incident_types (
          name, description, icon, color, priority, is_active, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
        ) RETURNING id, name
      `;

      let insertedCount = 0;
      
      for (const incidentType of this.incidentTypes) {
        try {
          const result = await this.db.query(insertQuery, [
            incidentType.name,
            incidentType.description,
            incidentType.icon,
            incidentType.color,
            incidentType.priority,
            true // is_active
          ]);
          
          logger.debug(`Inserted: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
          insertedCount++;
          
        } catch (err) {
          logger.error(`Failed to insert incident type "${incidentType.name}":`, err.message);
          throw err;
        }
      }
      
      logger.info(`SimpleIncidentTypeSeeder: Successfully seeded ${insertedCount} incident types`);
      return insertedCount;
      
    } catch (error) {
      logger.error('SimpleIncidentTypeSeeder: Incident type seeding failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify seeded data
   */
  async verifySeededData() {
    try {
      const queries = [
        {
          name: 'Total incident types count',
          query: 'SELECT COUNT(*) as count FROM incident_types'
        },
        {
          name: 'Active incident types',
          query: 'SELECT COUNT(*) as count FROM incident_types WHERE is_active = true'
        },
        {
          name: 'Incident types by priority',
          query: 'SELECT priority, COUNT(*) as count FROM incident_types GROUP BY priority ORDER BY priority'
        }
      ];

      const results = await Promise.all(
        queries.map(async ({ name, query }) => {
          try {
            const result = await this.db.query(query);
            return { name, result: result.rows };
          } catch (err) {
            logger.error(`Verification query failed for "${name}":`, err.message);
            throw err;
          }
        })
      );

      // Log verification results
      results.forEach(({ name, result }) => {
        logger.info(`✓ ${name}: ${JSON.stringify(result)}`);
      });

      // Check that we have the expected number of incident types
      const totalCount = results[0].result[0].count;
      const expectedCount = this.incidentTypes.length;
      
      if (parseInt(totalCount) !== expectedCount) {
        throw new Error(`Expected ${expectedCount} incident types, but found ${totalCount}`);
      }

      logger.info('SimpleIncidentTypeSeeder: Data verification passed');
      return true;
      
    } catch (error) {
      logger.error('SimpleIncidentTypeSeeder: Data verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Main run method
   */
  async run() {
    try {
      logger.info('SimpleIncidentTypeSeeder: Starting seeding process');
      
      // Initialize database connection
      await this.initialize();
      
      // Clear existing data
      await this.clearExistingTypes();
      
      // Seed new data
      const insertedCount = await this.seedIncidentTypes();
      
      // Verify the seeded data
      await this.verifySeededData();
      
      logger.info(`SimpleIncidentTypeSeeder: Seeding completed successfully! Inserted ${insertedCount} incident types`);
      
      return {
        success: true,
        insertedCount,
        message: 'Incident types seeded successfully'
      };
      
    } catch (error) {
      logger.error('SimpleIncidentTypeSeeder: Seeding process failed:', error.message);
      throw error;
    }
  }
}

module.exports = SimpleIncidentTypeSeeder;
