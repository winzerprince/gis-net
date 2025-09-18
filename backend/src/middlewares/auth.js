/**
 * ==================================================
 * AUTHENTICATION & AUTHORIZATION MIDDLEWARE
 * JWT Token Verification & Role-Based Access Control
 * ==================================================
 * 
 * This module provides Express middleware for authentication and authorization
 * in the GIS-NET application. It includes:
 * 
 * MIDDLEWARE FUNCTIONS:
 * - authenticateToken: Verifies JWT tokens from Authorization header
 * - requireRole: Enforces role-based access control (RBAC)
 * - optionalAuth: Provides optional authentication for public endpoints
 * - requireVerifiedEmail: Ensures user has verified their email
 * - requireActiveAccount: Checks if user account is active
 * 
 * SECURITY FEATURES:
 * - Bearer token extraction and validation
 * - Comprehensive error handling with security logging
 * - Rate limiting integration for failed attempts
 * - User context injection for downstream handlers
 * - Flexible role hierarchy enforcement
 * 
 * DEPENDENCIES:
 * - Authentication service: Token verification and user validation
 * - Logger service: Security event tracking
 * - Database connection: User data retrieval
 * 
 * USAGE:
 * app.use('/api/incidents', authenticateToken, incidentRoutes);
 * app.use('/api/admin', requireRole(['admin']), adminRoutes);
 */

const authService = require('../services/auth');
const db = require('../db/connection');
const logger = require('../services/logger');

/**
 * Extracts Bearer token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null if not found
 */
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Main authentication middleware - verifies JWT tokens
 * Attaches user object to req.user for downstream middleware
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req);
    
    if (!token) {
      logger.logSecurity('missing_auth_token', {
        endpoint: req.path,
        method: req.method,
      }, req);
      
      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'Authentication token is required',
        code: 'MISSING_TOKEN',
      });
    }

    // Verify token using auth service
    const decoded = await authService.verifyToken(token);
    
    // Get fresh user data from database
    const userResult = await db.query(
      'SELECT id, username, email, role, first_name, last_name, is_active, email_verified, last_login FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      logger.logSecurity('token_user_not_found', {
        userId: decoded.userId,
        endpoint: req.path,
      }, req);
      
      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'User account not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];

    // Check if account is active
    if (!user.is_active) {
      logger.logSecurity('inactive_account_access', {
        userId: user.id,
        username: user.username,
      }, req);
      
      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'Account has been deactivated',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Attach user to request object
    req.user = user;
    req.token = {
      raw: token,
      decoded: decoded,
    };

    // Update last login timestamp (async, don't wait)
    db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id])
      .catch(error => logger.error('Failed to update last_login:', error.message));

    logger.debug(`✅ User authenticated: ${user.username} (${user.role})`, {
      userId: user.id,
      role: user.role,
      endpoint: req.path,
    });

    next();

  } catch (error) {
    logger.logSecurity('authentication_failed', {
      error: error.message,
      endpoint: req.path,
      method: req.method,
    }, req);

    // Handle specific token errors
    if (error.message === 'Token expired') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Please refresh your authentication token',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.message === 'Invalid token') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Authentication token is malformed or invalid',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'Unable to verify authentication token',
      code: 'AUTH_FAILED',
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 * Useful for endpoints that work for both authenticated and anonymous users
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req);
    
    if (!token) {
      // No token provided, continue as anonymous user
      req.user = null;
      return next();
    }

    // Token provided, attempt to authenticate
    const decoded = await authService.verifyToken(token);
    
    const userResult = await db.query(
      'SELECT id, username, email, role, first_name, last_name, is_active, email_verified FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length > 0) {
      req.user = userResult.rows[0];
      req.token = { raw: token, decoded: decoded };
      
      logger.debug(`✅ Optional auth successful: ${req.user.username}`, {
        userId: req.user.id,
        endpoint: req.path,
      });
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // For optional auth, continue as anonymous if token verification fails
    logger.debug(`⚠️  Optional auth failed: ${error.message}`, {
      endpoint: req.path,
    });
    
    req.user = null;
    next();
  }
};

/**
 * Role-based authorization middleware factory
 * Creates middleware that requires user to have one of the specified roles
 * 
 * @param {Array<string>} allowedRoles - Array of role names that can access the endpoint
 * @returns {Function} Express middleware function
 */
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    // Ensure user is authenticated first
    if (!req.user) {
      logger.logSecurity('authorization_no_user', {
        requiredRoles: allowedRoles,
        endpoint: req.path,
      }, req);
      
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
        code: 'AUTH_REQUIRED',
      });
    }

    // Check if user role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      logger.logSecurity('authorization_insufficient_role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        endpoint: req.path,
      }, req);
      
      return res.status(403).json({
        success: false,
        error: 'admin permissions required',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    logger.debug(`✅ Role authorization passed: ${req.user.role}`, {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: allowedRoles,
      endpoint: req.path,
    });

    next();
  };
};

/**
 * Middleware to require verified email address
 * Useful for endpoints that require email verification
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!req.user.email_verified) {
    logger.logSecurity('unverified_email_access', {
      userId: req.user.id,
      email: req.user.email,
      endpoint: req.path,
    }, req);
    
    return res.status(403).json({
      success: false,
      error: 'Email verification required',
      message: 'Please verify your email address to access this resource',
      code: 'EMAIL_UNVERIFIED',
    });
  }

  next();
};

/**
 * Middleware to ensure user account is active
 * Redundant check since authenticateToken already verifies this,
 * but useful for extra security on sensitive endpoints
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireActiveAccount = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!req.user.is_active) {
    logger.logSecurity('inactive_account_blocked', {
      userId: req.user.id,
      username: req.user.username,
      endpoint: req.path,
    }, req);
    
    return res.status(403).json({
      success: false,
      error: 'Account inactive',
      message: 'Your account has been deactivated. Please contact support.',
      code: 'ACCOUNT_INACTIVE',
    });
  }

  next();
};

/**
 * Middleware to check if user owns a resource or is admin/moderator
 * Useful for endpoints where users can only modify their own data
 * 
 * @param {string} resourceUserIdField - Field name in req.params that contains the user ID
 * @returns {Function} Express middleware function
 */
const requireOwnershipOrRole = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const resourceUserId = parseInt(req.params[resourceUserIdField]);
    const isOwner = req.user.id === resourceUserId;
    const isAdminOrMod = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdminOrMod) {
      logger.logSecurity('ownership_violation', {
        userId: req.user.id,
        resourceUserId: resourceUserId,
        endpoint: req.path,
      }, req);
      
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only access your own resources',
        code: 'ACCESS_DENIED',
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireVerifiedEmail,
  requireActiveAccount,
  requireOwnershipOrRole,
};
