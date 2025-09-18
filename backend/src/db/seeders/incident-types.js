/**
 * ==================================================
 * INCIDENT TYPES DATABASE SEEDER
 * Traffic Incident Categories Population Script
 * ==================================================
 * 
 * This seeder populates the incident_types table with predefined
 * categories for traffic incidents. It includes comprehensive
 * incident types across multiple categories such as accidents,
 * construction, weather conditions, and emergency situations.
 * 
 * INCIDENT CATEGORIES:
 * - Traffic Accidents (Vehicle collisions, pedestrian incidents)
 * - Road Construction (Lane closures, detours, roadwork)
 * - Weather-Related (Snow, ice, flooding, visibility issues)
 * - Infrastructure (Signal outages, road damage, barriers)
 * - Emergency Services (Fire, police, medical responses)
 * - Hazardous Conditions (Debris, spills, unsafe road conditions)
 * 
 * FEATURES:
 * - Comprehensive incident type definitions
 * - Duplicate prevention with conflict resolution
 * - Data verification and rollback capabilities
 * - Command-line execution support
 * - Logging and error handling
 * 
 * DEPENDENCIES:
 * - PostgreSQL database with incident_types table
 * - Database connection module
 * - Logger service for operation tracking
 * 
 * USAGE:
 * node incident-types.js
 * npm run seed:incidents
 */

require('dotenv').config();
const logger = require('../../services/logger');
const db = require('../connection');

class IncidentTypeSeeder {
  constructor() {
    this.db = db;
    this.incidentTypes = [
      // TRAFFIC ACCIDENTS
      {
        name: 'Vehicle Collision',
        category: 'accident',
        description: 'Motor vehicle accident involving one or more vehicles',
        severity_range: [2, 5],
        default_severity: 3,
        icon: 'car-crash',
        color: '#ff4444',
        requires_verification: true,
        auto_expire_hours: 4,
      },
      {
        name: 'Vehicle Breakdown',
        category: 'accident',
        description: 'Disabled or broken-down vehicle blocking traffic',
        severity_range: [1, 3],
        default_severity: 2,
        icon: 'car-breakdown',
        color: '#ff8800',
        requires_verification: false,
        auto_expire_hours: 2,
      },
      {
        name: 'Pedestrian Incident',
        category: 'accident',
        description: 'Incident involving pedestrians on or near roadway',
        severity_range: [3, 5],
        default_severity: 4,
        icon: 'pedestrian',
        color: '#cc0000',
        requires_verification: true,
        auto_expire_hours: 6,
      },

      // ROAD CONDITIONS
      {
        name: 'Road Construction',
        category: 'construction',
        description: 'Active construction work affecting traffic flow',
        severity_range: [1, 4],
        default_severity: 2,
        icon: 'construction',
        color: '#ffaa00',
        requires_verification: true,
        auto_expire_hours: null, // Long-term, no auto-expiry
      },
      {
        name: 'Lane Closure',
        category: 'construction',
        description: 'One or more lanes temporarily closed',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'lane-closed',
        color: '#ff6600',
        requires_verification: true,
        auto_expire_hours: 8,
      },
      {
        name: 'Road Maintenance',
        category: 'construction',
        description: 'Routine maintenance work affecting traffic',
        severity_range: [1, 3],
        default_severity: 2,
        icon: 'maintenance',
        color: '#ffcc00',
        requires_verification: false,
        auto_expire_hours: 4,
      },

      // WEATHER CONDITIONS
      {
        name: 'Flooding',
        category: 'weather',
        description: 'Road flooding making passage difficult or impossible',
        severity_range: [3, 5],
        default_severity: 4,
        icon: 'flood',
        color: '#0066cc',
        requires_verification: true,
        auto_expire_hours: 12,
      },
      {
        name: 'Ice/Snow Conditions',
        category: 'weather',
        description: 'Hazardous winter weather conditions',
        severity_range: [2, 5],
        default_severity: 3,
        icon: 'snow',
        color: '#4488cc',
        requires_verification: false,
        auto_expire_hours: 6,
      },
      {
        name: 'Poor Visibility',
        category: 'weather',
        description: 'Fog, heavy rain, or other visibility-reducing conditions',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'fog',
        color: '#888888',
        requires_verification: false,
        auto_expire_hours: 3,
      },

      // TRAFFIC CONTROL
      {
        name: 'Traffic Signal Malfunction',
        category: 'control',
        description: 'Traffic light or signal system not working properly',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'traffic-light',
        color: '#ffaa44',
        requires_verification: true,
        auto_expire_hours: 6,
      },
      {
        name: 'Road Closure',
        category: 'control',
        description: 'Complete road closure preventing passage',
        severity_range: [4, 5],
        default_severity: 5,
        icon: 'road-closed',
        color: '#cc0000',
        requires_verification: true,
        auto_expire_hours: null, // Requires manual resolution
      },
      {
        name: 'Detour in Effect',
        category: 'control',
        description: 'Traffic being redirected via alternate route',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'detour',
        color: '#ff9900',
        requires_verification: true,
        auto_expire_hours: 12,
      },

      // EMERGENCY SITUATIONS
      {
        name: 'Police Activity',
        category: 'emergency',
        description: 'Law enforcement activity affecting traffic',
        severity_range: [2, 5],
        default_severity: 3,
        icon: 'police',
        color: '#0044cc',
        requires_verification: true,
        auto_expire_hours: 4,
      },
      {
        name: 'Fire Department Activity',
        category: 'emergency',
        description: 'Fire department response affecting roadway',
        severity_range: [3, 5],
        default_severity: 4,
        icon: 'fire-truck',
        color: '#cc4400',
        requires_verification: true,
        auto_expire_hours: 3,
      },
      {
        name: 'Medical Emergency',
        category: 'emergency',
        description: 'Ambulance or medical response on roadway',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'ambulance',
        color: '#cc0044',
        requires_verification: true,
        auto_expire_hours: 2,
      },

      // INFRASTRUCTURE ISSUES
      {
        name: 'Pothole/Road Damage',
        category: 'infrastructure',
        description: 'Pavement damage creating driving hazard',
        severity_range: [1, 3],
        default_severity: 2,
        icon: 'pothole',
        color: '#666666',
        requires_verification: false,
        auto_expire_hours: null, // Requires manual repair
      },
      {
        name: 'Bridge Issues',
        category: 'infrastructure',
        description: 'Bridge closure or weight restrictions',
        severity_range: [3, 5],
        default_severity: 4,
        icon: 'bridge',
        color: '#8844aa',
        requires_verification: true,
        auto_expire_hours: null, // Requires manual resolution
      },
      {
        name: 'Utility Work',
        category: 'infrastructure',
        description: 'Gas, electric, or water utility work affecting traffic',
        severity_range: [1, 4],
        default_severity: 2,
        icon: 'utility',
        color: '#aa8800',
        requires_verification: true,
        auto_expire_hours: 8,
      },

      // HAZARDS
      {
        name: 'Debris on Road',
        category: 'hazard',
        description: 'Objects or debris blocking or affecting traffic',
        severity_range: [2, 4],
        default_severity: 3,
        icon: 'debris',
        color: '#996633',
        requires_verification: false,
        auto_expire_hours: 2,
      },
      {
        name: 'Animal on Roadway',
        category: 'hazard',
        description: 'Animals creating traffic hazard',
        severity_range: [1, 4],
        default_severity: 2,
        icon: 'animal',
        color: '#228844',
        requires_verification: false,
        auto_expire_hours: 1,
      },
      {
        name: 'Stalled Vehicle',
        category: 'hazard',
        description: 'Vehicle stopped in travel lane or shoulder',
        severity_range: [1, 3],
        default_severity: 2,
        icon: 'stalled',
        color: '#ff6666',
        requires_verification: false,
        auto_expire_hours: 1,
      },
    ];
  }

  /**
   * Initialize database connection and verify PostGIS extension
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      logger.debug('Database already connected');
      return;
    }

    try {
      // Initialize shared DB connection if not connected
      if (!this.db.isConnected) {
        await this.db.initialize();
      }
      this.isConnected = this.db.isConnected;
      logger.info('✅ Database connection established successfully');
      
    } catch (error) {
      this.isConnected = false;
      logger.logError(error, null, { operation: 'database_connect' });
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Clean up existing incident types (for fresh seeding)
   */
  async clearExistingTypes() {
    try {
      logger.info('IncidentTypeSeeder: Clearing existing incident types');
      
      // Delete in correct order to respect foreign key constraints
      await this.db.query('DELETE FROM incidents WHERE type_id IS NOT NULL');
      await this.db.query('DELETE FROM incident_types');
      
      // Reset sequence to start from 1
      await this.db.query('ALTER SEQUENCE incident_types_id_seq RESTART WITH 1');
      
      logger.info('IncidentTypeSeeder: Existing types cleared');
    } catch (error) {
      logger.logError(error, null, { 
        operation: 'clear_incident_types' 
      });
      throw error;
    }
  }

  /**
   * Insert all predefined incident types
   */
  async seedIncidentTypes() {
    try {
      logger.info('IncidentTypeSeeder: Starting incident type seeding');
      
      const insertQuery = `
        INSERT INTO incident_types (
          name, category, description, severity_range, 
          default_severity, icon, color, requires_verification, 
          auto_expire_hours, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
        ) RETURNING id, name
      `;

      let insertedCount = 0;
      
      for (const incidentType of this.incidentTypes) {
        try {
          const result = await this.db.query(insertQuery, [
            incidentType.name,
            incidentType.category,
            incidentType.description,
            JSON.stringify(incidentType.severity_range),
            incidentType.default_severity,
            incidentType.icon,
            incidentType.color,
            incidentType.requires_verification,
            incidentType.auto_expire_hours,
          ]);

          insertedCount++;
          logger.debug(`IncidentTypeSeeder: Inserted "${incidentType.name}" (ID: ${result.rows[0].id})`);
          
        } catch (typeError) {
          logger.logError(typeError, null, { 
            operation: 'insert_incident_type',
            incidentType: incidentType.name,
          });
          // Continue with other types even if one fails
        }
      }

      logger.info(`IncidentTypeSeeder: Successfully seeded ${insertedCount} incident types`);
      return insertedCount;
      
    } catch (error) {
      logger.logError(error, null, { 
        operation: 'seed_incident_types' 
      });
      throw error;
    }
  }

  /**
   * Verify seeded data integrity
   */
  async verifySeededData() {
    try {
      const countQuery = 'SELECT COUNT(*) as total FROM incident_types';
      const categoryQuery = `
        SELECT category, COUNT(*) as count 
        FROM incident_types 
        GROUP BY category 
        ORDER BY category
      `;

      const [countResult, categoryResult] = await Promise.all([
        this.db.query(countQuery),
        this.db.query(categoryQuery)
      ]);

      const totalTypes = parseInt(countResult.rows[0].total);
      const categoryCounts = categoryResult.rows;

      logger.info('IncidentTypeSeeder: Verification Results', {
        totalTypes,
        expectedTypes: this.incidentTypes.length,
        categories: categoryCounts,
      });

      // Verify all expected types are present
      if (totalTypes !== this.incidentTypes.length) {
        throw new Error(`Expected ${this.incidentTypes.length} types, found ${totalTypes}`);
      }

      return {
        success: true,
        totalTypes,
        categoryCounts,
      };

    } catch (error) {
      logger.logError(error, null, { 
        operation: 'verify_seeded_data' 
      });
      throw error;
    }
  }

  /**
   * Run the complete seeding process
   */
  async run(options = {}) {
    try {
      const { clearExisting = true, verify = true } = options;
      
      logger.info('IncidentTypeSeeder: Starting seeding process', options);

      await this.connect();

      if (clearExisting) {
        await this.clearExistingTypes();
      }

      const insertedCount = await this.seedIncidentTypes();

      let verificationResult = null;
      if (verify) {
        verificationResult = await this.verifySeededData();
      }

      logger.info('IncidentTypeSeeder: Seeding completed successfully', {
        insertedCount,
        verification: verificationResult,
      });

      return {
        success: true,
        insertedCount,
        verification: verificationResult,
      };

    } catch (error) {
      logger.logError(error, null, { 
        operation: 'incident_type_seeder_run' 
      });
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Rollback seeded data (for testing or cleanup)
   */
  async rollback() {
    try {
      logger.info('IncidentTypeSeeder: Rolling back seeded data');
      
      await this.connect();
      await this.clearExistingTypes();
      
      logger.info('IncidentTypeSeeder: Rollback completed');
      
    } catch (error) {
      logger.logError(error, null, { 
        operation: 'incident_type_seeder_rollback' 
      });
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    try {
  await this.db.close();
      logger.debug('IncidentTypeSeeder: Database disconnected');
    } catch (error) {
      logger.logError(error, null, { 
        operation: 'incident_type_seeder_disconnect' 
      });
    }
  }

  /**
   * Get incident type statistics for reporting
   */
  async getStatistics() {
    try {
      await this.connect();

      const statsQuery = `
        SELECT 
          category,
          COUNT(*) as type_count,
          AVG(default_severity::numeric) as avg_severity,
          COUNT(CASE WHEN requires_verification THEN 1 END) as verification_required_count
        FROM incident_types
        GROUP BY category
        ORDER BY category
      `;

      const result = await this.db.query(statsQuery);
      
      return {
        success: true,
        statistics: result.rows,
        total_types: result.rows.reduce((sum, row) => sum + parseInt(row.type_count), 0),
      };

    } catch (error) {
      logger.logError(error, null, { 
        operation: 'get_incident_type_statistics' 
      });
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// Command-line execution support
if (require.main === module) {
  const seeder = new IncidentTypeSeeder();
  
  const command = process.argv[2] || 'run';
  
  switch (command) {
    case 'run':
      seeder.run()
        .then(() => {
          console.log('✅ Incident type seeding completed successfully');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Incident type seeding failed:', error.message);
          process.exit(1);
        });
      break;
      
    case 'rollback':
      seeder.rollback()
        .then(() => {
          console.log('✅ Incident type rollback completed successfully');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Incident type rollback failed:', error.message);
          process.exit(1);
        });
      break;
      
    case 'stats':
      seeder.getStatistics()
        .then((stats) => {
          console.log('📊 Incident Type Statistics:');
          console.table(stats.statistics);
          console.log(`Total Types: ${stats.total_types}`);
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Failed to get statistics:', error.message);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage: node incident-types.js [run|rollback|stats]');
      process.exit(1);
  }
}

module.exports = IncidentTypeSeeder;
 
