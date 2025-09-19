-- GIS-NET DATABASE INITIALIZATION SCRIPT
-- PostgreSQL + PostGIS Schema Setup

-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create custom types for enhanced data integrity
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE incident_status AS ENUM ('active', 'resolved', 'in_progress', 'false_report');

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'user',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_username_check CHECK (LENGTH(username) >= 3),
    CONSTRAINT users_password_check CHECK (LENGTH(password) >= 60)
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Incident types table
CREATE TABLE IF NOT EXISTS incident_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(7),
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT incident_types_name_check CHECK (LENGTH(name) >= 2),
    CONSTRAINT incident_types_color_check CHECK (color ~* '^#[0-9A-F]{6}$')
);

-- Index for incident types
CREATE INDEX IF NOT EXISTS idx_incident_types_active ON incident_types(is_active) WHERE is_active = true;

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    type_id INTEGER REFERENCES incident_types(id) NOT NULL,
    reported_by INTEGER REFERENCES users(id) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity INTEGER DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
    status incident_status DEFAULT 'active',
    location GEOMETRY(POINT, 4326) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(100),
    road_name VARCHAR(255),
    landmark_near TEXT,
    verified BOOLEAN DEFAULT false,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER REFERENCES users(id),
    resolution_notes TEXT,
    views_count INTEGER DEFAULT 0,
    reports_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT incidents_title_check CHECK (LENGTH(title) >= 5),
    CONSTRAINT incidents_location_check CHECK (ST_IsValid(location)),
    CONSTRAINT incidents_resolved_logic CHECK (
        (status = 'resolved' AND resolved_at IS NOT NULL) OR 
        (status != 'resolved' AND resolved_at IS NULL)
    )
);

-- Spatial indexes
CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST(location);
-- GIST indexes can only be used with spatial data, use separate indexes for type and location
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type_id);
CREATE INDEX IF NOT EXISTS idx_incidents_location_type ON incidents USING GIST(location) WHERE type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_status_location ON incidents USING GIST(location) WHERE status = 'active';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_incidents_type_id ON incidents(type_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_verified ON incidents(verified) WHERE verified = true;

-- Partial indexes
CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_incidents_active_location ON incidents USING GIST(location) WHERE status = 'active';

-- Incident reports table
CREATE TABLE IF NOT EXISTS incident_reports (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
    reported_by INTEGER REFERENCES users(id) NOT NULL,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('confirm', 'dispute', 'spam', 'resolved')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(incident_id, reported_by, report_type)
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_incident ON incident_reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_user ON incident_reports(reported_by);

-- Audit logs table
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

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at 
    BEFORE UPDATE ON incidents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
