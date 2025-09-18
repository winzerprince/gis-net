-- GIS-NET Database Schema Setup
-- Creates all necessary tables for the traffic incident reporting system

-- Enable PostGIS extension (already done)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL, -- Hashed with bcrypt
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Incident types for categorization
CREATE TABLE IF NOT EXISTS incident_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Incidents table with spatial data
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  type_id INTEGER REFERENCES incident_types(id) NOT NULL,
  description TEXT,
  location GEOMETRY(POINT, 4326) NOT NULL, -- WGS84 standard
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  reported_by INTEGER REFERENCES users(id) NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  severity INTEGER CHECK (severity BETWEEN 1 AND 5),
  verified BOOLEAN DEFAULT FALSE,
  verification_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  expires_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- User verifications for community validation
CREATE TABLE IF NOT EXISTS user_verifications (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  verified BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(incident_id, user_id)
);

-- Create spatial index for high-performance location queries
CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST(location);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_incidents_type_id ON incidents(type_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_is_deleted ON incidents(is_deleted);

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to relevant tables
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents;
CREATE TRIGGER update_incidents_updated_at 
    BEFORE UPDATE ON incidents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to winzer user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO winzer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO winzer;
GRANT USAGE ON SCHEMA public TO winzer;
