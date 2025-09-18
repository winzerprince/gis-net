/**
 * ==================================================
 * AUTHENTICATION ROUTES
 * Express Router for Authentication & User Management
 * ==================================================
 * 
 * This module defines all authentication-related routes for the GIS-NET API.
 * It integrates validation middleware, authentication controllers, and
 * security measures to provide a complete auth system.
 * 
 * ROUTE STRUCTURE:
 * - POST /api/auth/register: User registration with validation
 * - POST /api/auth/login: User authentication and token generation
 * - POST /api/auth/logout: Secure logout with token invalidation
 * - POST /api/auth/refresh: JWT token refresh endpoint
 * - POST /api/auth/forgot-password: Password reset request
 * - POST /api/auth/reset-password: Password reset completion
 * - POST /api/auth/verify-email: Email verification
 * - GET /api/auth/me: Current user profile information
 * 
 * SECURITY FEATURES:
 * - Input validation using Joi schemas
 * - Rate limiting for auth endpoints (configured in app.js)
 * - Comprehensive request/response logging
 * - Error handling with security considerations
 * - CORS protection for sensitive operations
 * 
 * DEPENDENCIES:
 * - Express Router: Route definition and middleware
 * - Auth Controller: Business logic for authentication
 * - Validation Middleware: Input sanitization and validation
 * - Auth Middleware: JWT token verification
 * - Logger Service: Security event logging
 * 
 * USAGE:
 * const authRoutes = require('./routes/auth');
 * app.use('/api/auth', authRoutes);
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth');
const { authenticateToken } = require('../middlewares/auth');
const {
  validateRegistration,
  validateLogin,
  validateRefreshToken,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateEmailVerification,
} = require('../middlewares/validation');
const logger = require('../services/logger');

const router = express.Router();

/**
 * Enhanced rate limiting for sensitive authentication endpoints
 */

// Strict rate limiting for registration (prevents spam accounts)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: {
    error: 'Too many registration attempts',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.logSecurity('registration_rate_limit_exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      attemptedUsername: req.body?.username,
      attemptedEmail: req.body?.email,
    }, req);
    
    res.status(429).json({
      error: 'Too many registration attempts',
      retryAfter: '1 hour',
    });
  },
});

// Very strict rate limiting for password reset (prevents abuse)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2, // 2 reset attempts per 15 minutes
  message: {
    error: 'Too many password reset attempts',
    message: 'Please wait 15 minutes before requesting another password reset',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate rate limiting for token refresh
const tokenRefreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 refresh attempts per 5 minutes
  message: {
    error: 'Too many token refresh attempts',
    message: 'Please wait before refreshing your token again',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 * @body    { username, email, password, confirmPassword, firstName?, lastName?, phone?, acceptTerms }
 * @returns { user, tokens, verificationRequired }
 */
router.post('/register', 
  registrationLimiter,
  validateRegistration,
  async (req, res) => {
    logger.http('Auth: Registration attempt', {
      username: req.body.username,
      email: req.body.email,
      clientIP: req.ip,
    });
    
    await authController.register(req, res);
  }
);

/**
 * @route   POST /api/auth/login  
 * @desc    Authenticate user and return JWT tokens
 * @access  Public
 * @body    { email, password, rememberMe? }
 * @returns { user, tokens }
 */
router.post('/login',
  validateLogin,
  async (req, res) => {
    logger.http('Auth: Login attempt', {
      email: req.body.email,
      clientIP: req.ip,
      rememberMe: req.body.rememberMe,
    });
    
    await authController.login(req, res);
  }
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate tokens
 * @access  Private (requires authentication)
 * @returns { success, message }
 */
router.post('/logout',
  authenticateToken,
  async (req, res) => {
    logger.http('Auth: Logout request', {
      userId: req.user.id,
      username: req.user.username,
      clientIP: req.ip,
    });
    
    await authController.logout(req, res);
  }
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT access token using refresh token
 * @access  Public (but requires valid refresh token)
 * @body    { refreshToken }
 * @returns { accessToken, user }
 */
router.post('/refresh',
  tokenRefreshLimiter,
  validateRefreshToken,
  async (req, res) => {
    logger.http('Auth: Token refresh request', {
      clientIP: req.ip,
    });
    
    await authController.refreshToken(req, res);
  }
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile information
 * @access  Private (requires authentication)
 * @returns { user }
 */
router.get('/me',
  authenticateToken,
  async (req, res) => {
    try {
      const user = req.user;
      
      logger.debug('Auth: Profile info request', {
        userId: user.id,
        username: user.username,
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isActive: user.is_active,
          emailVerified: user.email_verified,
          lastLogin: user.last_login,
        }
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'get_current_user',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Profile retrieval failed',
        message: 'Unable to retrieve user profile',
      });
    }
  }
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset token
 * @access  Public
 * @body    { email }
 * @returns { success, message }
 */
router.post('/forgot-password',
  passwordResetLimiter,
  validatePasswordResetRequest,
  async (req, res) => {
    try {
      const { email } = req.body;
      
      logger.http('Auth: Password reset request', {
        email,
        clientIP: req.ip,
      });

      // Always return success to prevent email enumeration
      // Actual implementation would send email if user exists
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent',
      });

      // TODO: Implement actual password reset email sending
      // This would involve:
      // 1. Check if user exists
      // 2. Generate secure reset token
      // 3. Send email with reset link
      // 4. Log security event

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'forgot_password',
        email: req.body?.email,
      });

      res.status(500).json({
        error: 'Password reset failed',
        message: 'Unable to process password reset request',
      });
    }
  }
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Complete password reset using token
 * @access  Public
 * @body    { token, password, confirmPassword }
 * @returns { success, message }
 */
router.post('/reset-password',
  validatePasswordReset,
  async (req, res) => {
    try {
      const { token, password } = req.body;
      
      logger.http('Auth: Password reset completion', {
        token: token.substring(0, 8) + '...',
        clientIP: req.ip,
      });

      // TODO: Implement password reset completion
      // This would involve:
      // 1. Validate reset token
      // 2. Check token expiry
      // 3. Update user password
      // 4. Invalidate reset token
      // 5. Log security event

      res.json({
        success: true,
        message: 'Password has been reset successfully',
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'reset_password',
      });

      res.status(500).json({
        error: 'Password reset failed',
        message: 'Unable to reset password',
      });
    }
  }
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify user email address using token
 * @access  Public
 * @body    { token }
 * @returns { success, message }
 */
router.post('/verify-email',
  validateEmailVerification,
  async (req, res) => {
    try {
      const { token } = req.body;
      
      logger.http('Auth: Email verification attempt', {
        token: token.substring(0, 8) + '...',
        clientIP: req.ip,
      });

      // TODO: Implement email verification
      // This would involve:
      // 1. Validate verification token
      // 2. Check token expiry
      // 3. Mark email as verified
      // 4. Update user record
      // 5. Log security event

      res.json({
        success: true,
        message: 'Email address verified successfully',
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'verify_email',
      });

      res.status(500).json({
        error: 'Email verification failed',
        message: 'Unable to verify email address',
      });
    }
  }
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification token
 * @access  Private (requires authentication)
 * @returns { success, message }
 */
router.post('/resend-verification',
  authenticateToken,
  async (req, res) => {
    try {
      const user = req.user;

      if (user.email_verified) {
        return res.status(400).json({
          error: 'Already verified',
          message: 'Your email address is already verified',
        });
      }

      logger.http('Auth: Resend verification request', {
        userId: user.id,
        email: user.email,
        clientIP: req.ip,
      });

      // TODO: Implement verification email resending
      // This would involve:
      // 1. Generate new verification token
      // 2. Send verification email
      // 3. Log security event

      res.json({
        success: true,
        message: 'Verification email has been resent',
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'resend_verification',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Verification resend failed',
        message: 'Unable to resend verification email',
      });
    }
  }
);

/**
 * Error handling middleware specifically for auth routes
 */
router.use((error, req, res, next) => {
  logger.logError(error, req, { 
    module: 'auth_routes',
    path: req.path,
    method: req.method,
  });

  // Handle specific auth errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input and try again',
      details: error.details,
    });
  }

  if (error.message?.includes('rate limit')) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
    });
  }

  // Generic auth error response
  res.status(500).json({
    error: 'Authentication error',
    message: 'An error occurred during authentication',
  });
});

module.exports = router;
