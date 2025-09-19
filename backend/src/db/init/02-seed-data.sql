-- ==================================================
-- GIS-NET DATABASE SEED DATA
-- Initial Data for Development & Testing
-- ==================================================
-- 
-- This script provides essential seed data including:
-- - Default incident types with icons and colors
-- - Administrative user account
-- - Sample incident data for testing
-- - Spatial data examples

-- Starting GIS-NET database seeding...

-- ==================================================
-- INCIDENT TYPES SEED DATA
-- ==================================================

INSERT INTO incident_types (name, description, icon, color, priority) VALUES
-- High Priority Traffic Incidents
('Accident', 'Traffic accidents and collisions', 'car-crash', '#DC2626', 5),
('Road Closure', 'Complete road closures and blockages', 'road-block', '#B91C1C', 5),
('Emergency Services', 'Police, fire, ambulance on scene', 'emergency', '#EF4444', 5),

-- Medium Priority Infrastructure Issues  
('Construction', 'Road construction and maintenance work', 'construction', '#F59E0B', 3),
('Traffic Jam', 'Heavy traffic congestion', 'traffic-light', '#DC2626', 3),
('Broken Traffic Light', 'Malfunctioning traffic signals', 'traffic-light-broken', '#F97316', 4),

-- General Road Conditions
('Pothole', 'Road surface damage and potholes', 'pothole', '#8B5CF6', 2),
('Flooding', 'Water on roadway', 'water', '#3B82F6', 4),
('Ice/Snow', 'Hazardous winter weather conditions', 'snowflake', '#06B6D4', 3),

-- Events and Temporary Issues
('Special Event', 'Parades, festivals, or public events', 'calendar', '#10B981', 2),
('Debris', 'Objects or debris on roadway', 'trash', '#6B7280', 2),
('Animal Crossing', 'Animals on or near roadway', 'animal', '#84CC16', 1),

-- Infrastructure and Utilities
('Street Light Out', 'Non-functioning street lighting', 'lightbulb', '#F59E0B', 2),
('Utility Work', 'Gas, water, electric utility work', 'wrench', '#8B5CF6', 3),
('Parking Issue', 'Illegal parking or parking violations', 'parking', '#6B7280', 1);

-- Incident types seeded successfully

-- ==================================================
-- ADMINISTRATIVE USER ACCOUNT
-- ==================================================

-- Password: 'admin123!' (hashed with bcrypt)
-- Note: In production, this should be changed immediately
INSERT INTO users (username, email, password, role, first_name, last_name, email_verified, is_active) VALUES
('admin', 'admin@gis-net.local', '$2b$12$LQv3c1yqBwlV1q.UKM.xAePjEFA.7q/qO/7m2k2QYLrS6f1/mm1HO', 'admin', 'System', 'Administrator', true, true),
('demo_user', 'demo@gis-net.local', '$2b$12$LQv3c1yqBwlV1q.UKM.xAePjEFA.7q/qO/7m2k2QYLrS6f1/mm1HO', 'user', 'Demo', 'User', true, true),
('moderator', 'mod@gis-net.local', '$2b$12$LQv3c1yqBwlV1q.UKM.xAePjEFA.7q/qO/7m2k2QYLrS6f1/mm1HO', 'moderator', 'Demo', 'Moderator', true, true);

-- Default users created successfully

-- ==================================================
-- SAMPLE INCIDENT DATA
-- Geographic locations around New York City for testing
-- ==================================================

-- Times Square Area Incidents
INSERT INTO incidents (type_id, reported_by, title, description, severity, location, address, city, region, country, road_name) VALUES
(1, 1, 'Multi-vehicle accident on Broadway', 'Three-car collision blocking two lanes of traffic near Times Square', 4, 
 ST_SetSRID(ST_MakePoint(-73.9857, 40.7580), 4326), '1560 Broadway', 'New York', 'NY', 'USA', 'Broadway'),

(2, 2, 'Broadway closed for parade setup', 'Street closure from 42nd to 47th Street for Thanksgiving parade preparation', 3,
 ST_SetSRID(ST_MakePoint(-73.9857, 40.7589), 4326), 'Broadway & 45th St', 'New York', 'NY', 'USA', 'Broadway'),

(4, 1, 'Construction work on 7th Avenue', 'Lane closure for utility work, expect delays', 2,
 ST_SetSRID(ST_MakePoint(-73.9832, 40.7527), 4326), '7th Avenue & 42nd St', 'New York', 'NY', 'USA', '7th Avenue');

-- Central Park Area
INSERT INTO incidents (type_id, reported_by, title, description, severity, location, address, city, region, country, road_name) VALUES
(5, 2, 'Heavy traffic on Central Park West', 'Congestion due to weekend park activities', 2,
 ST_SetSRID(ST_MakePoint(-73.9754, 40.7829), 4326), 'Central Park West & 79th St', 'New York', 'NY', 'USA', 'Central Park West'),

(7, 3, 'Large pothole on 5th Avenue', 'Deep pothole causing vehicle damage near Metropolitan Museum', 3,
 ST_SetSRID(ST_MakePoint(-73.9632, 40.7794), 4326), '5th Avenue & 82nd St', 'New York', 'NY', 'USA', '5th Avenue');

-- Brooklyn Bridge Area  
INSERT INTO incidents (type_id, reported_by, title, description, severity, location, address, city, region, country, road_name) VALUES
(6, 2, 'Traffic light malfunction on FDR Drive', 'Signal not working at South Street exit', 4,
 ST_SetSRID(ST_MakePoint(-73.9969, 40.7061), 4326), 'FDR Drive & South St', 'New York', 'NY', 'USA', 'FDR Drive'),

(11, 1, 'Debris on Brooklyn Bridge', 'Large construction materials fallen from truck', 3,
 ST_SetSRID(ST_MakePoint(-73.9969, 40.7057), 4326), 'Brooklyn Bridge', 'New York', 'NY', 'USA', 'Brooklyn Bridge');

-- Queens - Long Island Expressway
INSERT INTO incidents (type_id, reported_by, title, description, severity, location, address, city, region, country, road_name) VALUES
(1, 3, 'Fender bender on LIE westbound', 'Minor accident in left lane near Queens Blvd exit', 2,
 ST_SetSRID(ST_MakePoint(-73.8370, 40.7282), 4326), 'Long Island Expressway', 'Queens', 'NY', 'USA', 'Long Island Expressway'),

(8, 2, 'Flooding on Northern Boulevard', 'Water accumulation after heavy rain, proceed with caution', 3,
 ST_SetSRID(ST_MakePoint(-73.8067, 40.7681), 4326), 'Northern Blvd & Main St', 'Queens', 'NY', 'USA', 'Northern Boulevard');

-- Bronx Area
INSERT INTO incidents (type_id, reported_by, title, description, severity, location, address, city, region, country, road_name) VALUES
(10, 1, 'Yankees game traffic on Grand Concourse', 'Heavy congestion due to baseball game', 2,
 ST_SetSRID(ST_MakePoint(-73.9249, 40.8296), 4326), 'Grand Concourse & 161st St', 'Bronx', 'NY', 'USA', 'Grand Concourse'),

(13, 3, 'Street light outage on Fordham Road', 'Multiple streetlights not working near university', 2,
 ST_SetSRID(ST_MakePoint(-73.8998, 40.8621), 4326), 'Fordham Road & Webster Ave', 'Bronx', 'NY', 'USA', 'Fordham Road');

-- Set some incidents as verified
UPDATE incidents SET verified = true, verified_by = 1, verified_at = CURRENT_TIMESTAMP 
WHERE id IN (1, 3, 5, 7);

-- Set one incident as resolved
UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP - INTERVAL '2 hours', 
                    resolved_by = 1, resolution_notes = 'Accident cleared, traffic resumed normal flow'
WHERE id = 1;

-- Sample incidents created successfully

-- ==================================================
-- INCIDENT REPORTS (Community Validation)
-- ==================================================

-- Add some community reports for testing
INSERT INTO incident_reports (incident_id, reported_by, report_type, notes) VALUES
(2, 2, 'confirm', 'I can see the parade setup blocking the street'),
(2, 3, 'confirm', 'Confirmed - road is completely closed'),
(3, 2, 'confirm', 'Yes, there are construction workers and equipment present'),
(4, 1, 'dispute', 'Traffic seems normal to me, no major delays observed'),
(5, 3, 'confirm', 'Very deep pothole, damaged my tire'),
(6, 1, 'confirm', 'Traffic light is definitely not working'),
(7, 2, 'confirm', 'Saw the debris, looks like construction materials');

-- Community reports added successfully

-- ==================================================
-- REFRESH MATERIALIZED VIEWS
-- ==================================================

-- NOTE: Materialized view refresh commented out as view may not exist yet
-- REFRESH MATERIALIZED VIEW incident_clusters;

-- Materialized views refreshed

-- ==================================================
-- VERIFICATION & STATISTICS
-- ==================================================

-- Show seeded data statistics
SELECT 
    'Incident types created: ' || COUNT(*) as info
FROM incident_types;

SELECT 
    'Users created: ' || COUNT(*) as info  
FROM users;

SELECT 
    'Incidents created: ' || COUNT(*) as info
FROM incidents;

SELECT 
    'Community reports: ' || COUNT(*) as info
FROM incident_reports;

-- Show incident distribution by type
SELECT 
    it.name as incident_type,
    COUNT(i.id) as count,
    it.color,
    it.priority
FROM incident_types it
LEFT JOIN incidents i ON it.id = i.type_id
GROUP BY it.id, it.name, it.color, it.priority
ORDER BY it.priority DESC, COUNT(i.id) DESC;

-- Show geographic distribution (bounding box)
SELECT 
    'Geographic coverage:' as info,
    ST_AsText(ST_Envelope(ST_Collect(location))) as bounding_box
FROM incidents;

-- GIS-NET database seeding completed successfully!
-- 
-- Default login credentials:
--   Admin: admin@gis-net.local / admin123!
--   Demo User: demo@gis-net.local / admin123!  
--   Moderator: mod@gis-net.local / admin123!
-- 
-- Note: Change default passwords in production!
