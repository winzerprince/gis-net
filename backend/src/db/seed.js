#!/usr/bin/env node

/**
 * Database Seeder Script
 * Runs all seeding operations to populate the database with initial data
 */

const path = require('path');
const { fileURLToPath } = require('url');

// Import seeders
const SimpleIncidentTypeSeeder = require('./seeders/simple-seeder');

async function runSeeders() {
    console.log('🌱 Starting database seeding...\n');
    
    try {
        // Initialize and run incident types seeder
        const incidentSeeder = new SimpleIncidentTypeSeeder();
        await incidentSeeder.run();
        
        console.log('\n✅ Database seeding completed successfully!');
        
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    runSeeders()
        .then(() => {
            console.log('🎉 All seeders completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Fatal error during seeding:', error);
            process.exit(1);
        });
}

module.exports = { runSeeders };
