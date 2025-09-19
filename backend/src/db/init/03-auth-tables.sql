-- ==================================================
-- AUTHENTICATION & SECURITY TABLES
-- Additional Tables for JWT and Password Security
-- ==================================================
-- 
-- This script adds authentication and security-related tables
-- to support the advanced authentication system:
-- 
-- - JWT refresh token management
-- - Token blacklisting for secure logout
-- - Failed login attempt tracking for brute force protection
-- - Password reset token management
-- - Password history tracking for reuse prevention

-- Adding authentication and security tables...

-- ==================================================
-- USER REFRESH TOKENS TABLE
-- Tracks refresh tokens for extended authentication
-- ==================================================

CREATE TABLE IF NOT EXISTS user_refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_id VARCHAR(255) UNIQUE NOT NULL, -- JWT ID (jti)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one refresh token per user (replace on new login)
    UNIQUE(user_id)
);

CREATE INDEX idx_user_refresh_tokens_user_id ON user_refresh_tokens(user_id);
CREATE INDEX idx_user_refresh_tokens_token_id ON user_refresh_tokens(token_id);
CREATE INDEX idx_user_refresh_tokens_expires_at ON user_refresh_tokens(expires_at);

-- User refresh tokens table created

-- ==================================================
-- TOKEN BLACKLIST TABLE  
-- Stores invalidated JWT tokens for secure logout
-- ==================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
    id SERIAL PRIMARY KEY,
    token_id VARCHAR(255) UNIQUE NOT NULL, -- JWT ID (jti)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100) DEFAULT 'logout' -- logout, security, admin
);

CREATE UNIQUE INDEX idx_token_blacklist_token_id ON token_blacklist(token_id);
CREATE INDEX idx_token_blacklist_expires_at ON token_blacklist(expires_at);

-- Token blacklist table created

-- ==================================================
-- FAILED LOGIN ATTEMPTS TABLE
-- Tracks failed login attempts for brute force protection
-- ==================================================

CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- email or username (lowercase)
    client_ip INET NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failed_login_attempts_identifier ON failed_login_attempts(identifier);
CREATE INDEX idx_failed_login_attempts_client_ip ON failed_login_attempts(client_ip);
CREATE INDEX idx_failed_login_attempts_created_at ON failed_login_attempts(created_at);

-- Compound index for efficient lockout queries
CREATE INDEX idx_failed_login_attempts_lookup ON failed_login_attempts(identifier, created_at);

-- Failed login attempts table created

-- ==================================================
-- PASSWORD RESET TOKENS TABLE
-- Manages secure password reset tokens
-- ==================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL, -- Cryptographically secure token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Ensure one reset token per user
    UNIQUE(user_id)
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE UNIQUE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Password reset tokens table created

-- ==================================================
-- USER PASSWORD HISTORY TABLE
-- Tracks password history to prevent reuse
-- ==================================================

CREATE TABLE IF NOT EXISTS user_password_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_password_history_user_id ON user_password_history(user_id);
CREATE INDEX idx_user_password_history_created_at ON user_password_history(created_at DESC);

-- Compound index for efficient history queries
CREATE INDEX idx_user_password_history_user_created ON user_password_history(user_id, created_at DESC);

-- User password history table created

-- ==================================================
-- EMAIL VERIFICATION TOKENS TABLE
-- Manages email verification process
-- ==================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Ensure one verification token per user
    UNIQUE(user_id)
);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE UNIQUE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Email verification tokens table created

-- ==================================================
-- USER SESSIONS TABLE (OPTIONAL)
-- For tracking active user sessions
-- ==================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    client_ip INET,
    user_agent TEXT,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE UNIQUE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;

-- User sessions table created

-- ==================================================
-- SECURITY EVENTS TABLE
-- Comprehensive security event logging
-- ==================================================

CREATE TABLE IF NOT EXISTS security_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL, -- login_success, login_failed, password_changed, etc.
    event_data JSONB,
    client_ip INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraint for valid event types
    CONSTRAINT security_events_type_check CHECK (
        event_type IN (
            'login_success', 'login_failed', 'logout', 'password_changed',
            'password_reset_requested', 'password_reset_completed',
            'email_verified', 'account_locked', 'account_unlocked',
            'suspicious_activity', 'token_refresh', 'unauthorized_access'
        )
    )
);

CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX idx_security_events_client_ip ON security_events(client_ip);

-- GIN index for efficient JSONB queries
CREATE INDEX idx_security_events_data ON security_events USING GIN(event_data);

-- Security events table created

-- ==================================================
-- TRIGGERS FOR AUTOMATED SECURITY TRACKING
-- ==================================================

-- Function to log security events automatically
CREATE OR REPLACE FUNCTION log_security_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Log password changes
    IF TG_OP = 'UPDATE' AND OLD.password != NEW.password THEN
        INSERT INTO security_events (user_id, event_type, event_data)
        VALUES (NEW.id, 'password_changed', jsonb_build_object(
            'changed_at', CURRENT_TIMESTAMP,
            'user_agent', current_setting('application.user_agent', true),
            'client_ip', current_setting('application.client_ip', true)
        ));
    END IF;
    
    -- Log email verification
    IF TG_OP = 'UPDATE' AND OLD.email_verified = FALSE AND NEW.email_verified = TRUE THEN
        INSERT INTO security_events (user_id, event_type, event_data)
        VALUES (NEW.id, 'email_verified', jsonb_build_object(
            'verified_at', CURRENT_TIMESTAMP,
            'email', NEW.email
        ));
    END IF;
    
    -- Log account status changes
    IF TG_OP = 'UPDATE' AND OLD.is_active != NEW.is_active THEN
        INSERT INTO security_events (user_id, event_type, event_data)
        VALUES (NEW.id, 
            CASE WHEN NEW.is_active THEN 'account_unlocked' ELSE 'account_locked' END,
            jsonb_build_object(
                'changed_at', CURRENT_TIMESTAMP,
                'previous_status', OLD.is_active,
                'new_status', NEW.is_active
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply security logging trigger to users table
CREATE TRIGGER security_event_trigger
    AFTER UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION log_security_event();

-- Security event triggers created

-- ==================================================
-- CLEANUP FUNCTIONS
-- ==================================================

-- Function to clean up expired security data
CREATE OR REPLACE FUNCTION cleanup_expired_security_data()
RETURNS TABLE(
    expired_refresh_tokens INTEGER,
    expired_blacklist_tokens INTEGER,
    old_failed_attempts INTEGER,
    expired_reset_tokens INTEGER,
    expired_verification_tokens INTEGER,
    inactive_sessions INTEGER
) AS $$
DECLARE
    refresh_count INTEGER;
    blacklist_count INTEGER;
    failed_count INTEGER;
    reset_count INTEGER;
    verification_count INTEGER;
    session_count INTEGER;
BEGIN
    -- Clean expired refresh tokens
    DELETE FROM user_refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP;
    GET DIAGNOSTICS refresh_count = ROW_COUNT;
    
    -- Clean expired blacklisted tokens
    DELETE FROM token_blacklist WHERE expires_at <= CURRENT_TIMESTAMP;
    GET DIAGNOSTICS blacklist_count = ROW_COUNT;
    
    -- Clean old failed login attempts (older than 24 hours)
    DELETE FROM failed_login_attempts WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    GET DIAGNOSTICS failed_count = ROW_COUNT;
    
    -- Clean expired password reset tokens
    DELETE FROM password_reset_tokens WHERE expires_at <= CURRENT_TIMESTAMP;
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    
    -- Clean expired email verification tokens
    DELETE FROM email_verification_tokens WHERE expires_at <= CURRENT_TIMESTAMP;
    GET DIAGNOSTICS verification_count = ROW_COUNT;
    
    -- Clean expired sessions
    UPDATE user_sessions SET is_active = FALSE WHERE expires_at <= CURRENT_TIMESTAMP AND is_active = TRUE;
    GET DIAGNOSTICS session_count = ROW_COUNT;
    
    RETURN QUERY SELECT refresh_count, blacklist_count, failed_count, reset_count, verification_count, session_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup functions created

-- ==================================================
-- INITIAL DATA AND VERIFICATION
-- ==================================================

-- Verify all tables were created successfully
SELECT 
    'Authentication tables created: ' || string_agg(tablename, ', ') as info
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'user_refresh_tokens', 'token_blacklist', 'failed_login_attempts',
        'password_reset_tokens', 'user_password_history', 'email_verification_tokens',
        'user_sessions', 'security_events'
    );

-- Show table sizes and indexes
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'public' 
    AND tablename LIKE '%token%' OR tablename LIKE '%password%' OR tablename = 'security_events'
ORDER BY tablename, attname;

-- Authentication and security tables setup completed successfully!

-- ==================================================
-- PERFORMANCE RECOMMENDATIONS
-- ==================================================

-- Performance Recommendations:
-- 1. Run cleanup_expired_security_data() daily via cron job
-- 2. Monitor failed_login_attempts table size in high-traffic environments
-- 3. Consider partitioning security_events table by date for large datasets
-- 4. Regularly ANALYZE tables after bulk operations
-- 5. Set up monitoring for suspicious authentication patterns
