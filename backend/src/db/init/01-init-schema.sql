-- ==================================================
-- GIS-NET DATABASE INITIALIZATION SCRIPT
-- PostgreSQL + PostGIS Schema Setup
-- ==================================================
-- 
-- This script initializes the complete database schema for the
-- Real-Time Traffic Incident Reporting System with PostGIS support.
-- 
-- Features:
-- - PostGIS spatial extension
-- - User authentication system
-- - Spatial incident data with proper indexing
-- - Incident categorization system
-- - Performance optimizations
-- - Data integrity constraints

-- Starting GIS-NET database initialization...

-- ==================================================
-- EXTENSIONS & BASIC SETUP
-- ==================================================

-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create custom types for enhanced data integrity
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE incident_status AS ENUM ('active', 'resolved', 'in_progress', 'false_report');

-- Extensions and types created successfully

-- ==================================================
-- USER AUTHENTICATION SYSTEM
-- ==================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- bcrypt hashed
    role user_role DEFAULT 'user',
    
    -- Profile information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_username_check CHECK (LENGTH(username) >= 3),
    CONSTRAINT users_password_check CHECK (LENGTH(password) >= 60) -- bcrypt hash length
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Users table created with indexes

-- ==================================================
-- INCIDENT CATEGORIZATION SYSTEM
-- ==================================================

CREATE TABLE IF NOT EXISTS incident_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100), -- Icon identifier for frontend
    color VARCHAR(7), -- Hex color code (#RRGGBB)
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT incident_types_name_check CHECK (LENGTH(name) >= 2),
    CONSTRAINT incident_types_color_check CHECK (color ~* '^#[0-9A-F]{6}$')
);

-- Index for active incident types
CREATE INDEX IF NOT EXISTS idx_incident_types_active ON incident_types(is_active) WHERE is_active = true;

-- Incident types table created

-- ==================================================
-- MAIN INCIDENTS TABLE WITH SPATIAL DATA
-- ==================================================

CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    type_id INTEGER REFERENCES incident_types(id) NOT NULL,
    reported_by INTEGER REFERENCES users(id) NOT NULL,
    
    -- Incident details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity INTEGER DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
    status incident_status DEFAULT 'active',
    
    -- Spatial data (WGS84 - EPSG:4326)
    location GEOMETRY(POINT, 4326) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(100),
    
    -- Additional location context
    road_name VARCHAR(255),
    landmark_near TEXT,
    
    -- Administrative fields
    verified BOOLEAN DEFAULT false,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolution tracking
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER REFERENCES users(id),
    resolution_notes TEXT,
    
    -- Engagement metrics
    views_count INTEGER DEFAULT 0,
    reports_count INTEGER DEFAULT 1, -- Starts with 1 (initial report)
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT incidents_title_check CHECK (LENGTH(title) >= 5),
    CONSTRAINT incidents_location_check CHECK (ST_IsValid(location)),
    CONSTRAINT incidents_resolved_logic CHECK (
        (status = 'resolved' AND resolved_at IS NOT NULL) OR 
        (status != 'resolved' AND resolved_at IS NULL)
    )
);

-- ==================================================
-- SPATIAL INDEXES FOR HIGH-PERFORMANCE QUERIES
-- ==================================================

-- Primary spatial index using GiST
CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST(location);

-- Compound indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_incidents_type_location ON incidents USING GIST(type_id, location);
CREATE INDEX IF NOT EXISTS idx_incidents_status_location ON incidents USING GIST(status, location) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_incidents_created_location ON incidents USING GIST(created_at, location);

-- Performance indexes for filtering
CREATE INDEX IF NOT EXISTS idx_incidents_type_id ON incidents(type_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_verified ON incidents(verified) WHERE verified = true;

-- Partial indexes for active incidents (most common queries)
CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_incidents_active_location ON incidents USING GIST(location) WHERE status = 'active';

-- Incidents table created with comprehensive indexing

-- ==================================================
-- INCIDENT REPORTS & COMMUNITY VALIDATION
-- ==================================================

CREATE TABLE IF NOT EXISTS incident_reports (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
    reported_by INTEGER REFERENCES users(id) NOT NULL,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('confirm', 'dispute', 'spam', 'resolved')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate reports from same user
    UNIQUE(incident_id, reported_by, report_type)
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_incident ON incident_reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_user ON incident_reports(reported_by);

-- Incident reports table created

-- ==================================================
-- AUDIT LOG FOR SECURITY & TRACKING
-- ==================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_by INTEGER REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);

-- Audit logs table created

-- ==================================================
-- SPATIAL FUNCTIONS & VIEWS
-- ==================================================

-- Create a materialized view for incident clustering
DROP MATERIALIZED VIEW IF EXISTS incident_clusters CASCADE;
CREATE MATERIALIZED VIEW incident_clusters AS
SELECT 
    ST_ClusterKMeans(location, 10) OVER() as cluster_id,
    COUNT(*) as incident_count,
    ST_Centroid(ST_Collect(location)) as cluster_center,
    AVG(severity) as avg_severity,
    array_agg(DISTINCT type_id) as incident_types,
    MIN(created_at) as first_incident,
    MAX(created_at) as latest_incident
FROM incidents 
WHERE status = 'active' 
    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY cluster_id;

CREATE UNIQUE INDEX idx_incident_clusters_id ON incident_clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_incident_clusters_center ON incident_clusters USING GIST(cluster_center);

-- Spatial views created

-- ==================================================
-- TRIGGERS FOR AUTOMATED TASKS
-- ==================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at 
    BEFORE UPDATE ON incidents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update incident reports count
CREATE OR REPLACE FUNCTION update_incident_reports_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE incidents 
        SET reports_count = reports_count + 1 
        WHERE id = NEW.incident_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE incidents 
        SET reports_count = reports_count - 1 
        WHERE id = OLD.incident_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_incident_reports_count_trigger
    AFTER INSERT OR DELETE ON incident_reports
    FOR EACH ROW EXECUTE FUNCTION update_incident_reports_count();

-- Database triggers created

-- ==================================================
-- PERFORMANCE & MAINTENANCE
-- ==================================================

-- Set up automatic statistics collection
ALTER TABLE incidents SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE users SET (autovacuum_analyze_scale_factor = 0.1);

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_spatial_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY incident_clusters;
END;
$$ language 'plpgsql';

-- Performance optimizations applied

-- ==================================================
-- SECURITY SETTINGS
-- ==================================================

-- Enable Row Level Security where appropriate
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

-- Grant appropriate permissions (these will be set up properly in production)
-- GRANT CONNECT ON DATABASE trafficdb TO gis_app_user;
-- GRANT USAGE ON SCHEMA public TO gis_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gis_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gis_app_user;

-- Security settings configured
-- GIS-NET database initialization completed successfully!

-- ==================================================
-- DATABASE STATISTICS & VERIFICATION
-- ==================================================

-- Show PostGIS version and capabilities
SELECT 'PostGIS Version: ' || PostGIS_Version() as info;
SELECT 'GEOS Version: ' || GEOS_Version() as info;
SELECT 'PROJ Version: ' || PROJ_Version() as info;

-- Verify spatial reference system
SELECT 
    'Spatial Reference System EPSG:4326 available: ' || 
    CASE WHEN COUNT(*) > 0 THEN 'YES' ELSE 'NO' END as info
FROM spatial_ref_sys WHERE srid = 4326;

-- Show created tables
SELECT 
    'Tables created: ' || string_agg(tablename, ', ') as info
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'incident_types', 'incidents', 'incident_reports', 'audit_logs');

-- Database verification completed!
