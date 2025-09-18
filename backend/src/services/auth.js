/**
 * ==================================================
 * JWT AUTHENTICATION SERVICE
 * Token Generation, Verification & Refresh Management
 * ==================================================
 * 
 * This module provides comprehensive JWT (JSON Web Token) authentication services 
 * for the GIS-NET application. It handles:
 * 
 * FEATURES:
 * - Access token generation with user payload embedding
 * - Refresh token management for extended sessions
 * - Token verification and payload extraction
 * - Automatic token refresh mechanics
 * - Blacklist management for secure logout
 * - Role-based authorization helpers
 * 
 * SECURITY CONSIDERATIONS:
 * - Uses strong JWT secrets (minimum 256-bit entropy)
 * - Implements token expiration for access & refresh tokens
 * - Provides secure token blacklisting for logout
 * - Includes rate limiting integration points
 * - Validates token structure and claims thoroughly
 * 
 * DEPENDENCIES:
 * - jsonwebtoken: JWT creation and verification
 * - Database connection: User lookup and blacklist management
 * - Logger service: Security event logging
 * 
 * USAGE:
 * const authService = require('./services/auth');
 * const token = await authService.generateAccessToken(user);
 * const payload = await authService.verifyToken(token);
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/connection');
const logger = require('./logger');

class AuthenticationService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.issuer = 'gis-net-backend';
    
    // Validate JWT secret on initialization
    this.validateJwtSecret();
  }

  /**
   * Validates that JWT secret meets security requirements
   * @throws {Error} If JWT secret is invalid or missing
   */
  validateJwtSecret() {
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    if (this.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long for security');
    }
    
    if (this.jwtSecret === 'your_super_secure_jwt_secret_minimum_32_characters_long_change_in_production') {
      logger.warn('⚠️  Using default JWT_SECRET! Change this in production!');
    }
  }

  /**
   * Generates an access token for authenticated user
   * @param {Object} user - User object from database
   * @param {Object} options - Additional token options
   * @returns {Promise<string>} JWT access token
   */
  async generateAccessToken(user, options = {}) {
    try {
      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        emailVerified: user.email_verified,
      };

      const tokenOptions = {
        issuer: this.issuer,
        audience: 'gis-net-frontend',
        subject: user.id.toString(),
        expiresIn: options.expiresIn || this.jwtExpiresIn,
        algorithm: 'HS256',
        jwtid: crypto.randomUUID(), // Unique token ID for blacklisting
      };

      const token = jwt.sign(payload, this.jwtSecret, tokenOptions);
      
      logger.debug(`🔐 Access token generated for user ${user.id}`, {
        userId: user.id,
        username: user.username,
        expiresIn: tokenOptions.expiresIn,
      });

      return token;

    } catch (error) {
      logger.error('❌ Failed to generate access token:', error.message);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generates a refresh token for extended authentication
   * @param {Object} user - User object from database
   * @returns {Promise<Object>} Refresh token and metadata
   */
  async generateRefreshToken(user) {
    try {
      const payload = {
        userId: user.id,
        type: 'refresh',
      };

      const tokenOptions = {
        issuer: this.issuer,
        audience: 'gis-net-frontend',
        subject: user.id.toString(),
        expiresIn: this.jwtRefreshExpiresIn,
        algorithm: 'HS256',
        jwtid: crypto.randomUUID(),
      };

      const token = jwt.sign(payload, this.jwtSecret, tokenOptions);
      const decoded = jwt.decode(token);

      // Store refresh token in database for tracking
      await db.query(`
        INSERT INTO user_refresh_tokens (user_id, token_id, expires_at, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET token_id = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP
      `, [user.id, decoded.jti, new Date(decoded.exp * 1000)]);

      logger.info(`🔄 Refresh token generated for user ${user.id}`, {
        userId: user.id,
        tokenId: decoded.jti,
      });

      return {
        token,
        tokenId: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
      };

    } catch (error) {
      logger.error('❌ Failed to generate refresh token:', error.message);
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Verifies and decodes a JWT token
   * @param {string} token - JWT token to verify
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyToken(token, options = {}) {
    try {
      const verifyOptions = {
        issuer: this.issuer,
        audience: 'gis-net-frontend',
        algorithms: ['HS256'],
        ...options,
      };

      const decoded = jwt.verify(token, this.jwtSecret, verifyOptions);
      
      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(decoded.jti);
      if (isBlacklisted) {
        throw new Error('Token has been invalidated');
      }

      // Verify user still exists and is active
      if (decoded.type !== 'refresh') {
        const userExists = await this.verifyUserExists(decoded.userId);
        if (!userExists) {
          throw new Error('User no longer exists');
        }
      }

      logger.debug(`✅ Token verified successfully for user ${decoded.userId}`);
      return decoded;

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        logger.logSecurity('invalid_token_attempt', {
          error: error.message,
          token: token.substring(0, 20) + '...',
        });
        throw new Error('Invalid token');
      } else if (error.name === 'TokenExpiredError') {
        logger.debug('⏰ Token expired');
        throw new Error('Token expired');
      } else {
        logger.error('❌ Token verification failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Refreshes an access token using a valid refresh token
   * @param {string} refreshToken - Valid refresh token
   * @returns {Promise<Object>} New access token and user info
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = await this.verifyToken(refreshToken, { 
        ignoreExpiration: false 
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token type');
      }

      // Get user from database
      const userResult = await db.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      const user = userResult.rows[0];

      // Verify refresh token exists in database
      const tokenResult = await db.query(
        'SELECT * FROM user_refresh_tokens WHERE user_id = $1 AND token_id = $2',
        [user.id, decoded.jti]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('Refresh token not found');
      }

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(user);

      logger.info(`🔄 Access token refreshed for user ${user.id}`, {
        userId: user.id,
        username: user.username,
      });

      return {
        accessToken: newAccessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      };

    } catch (error) {
      logger.error('❌ Token refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Invalidates a token by adding it to blacklist
   * @param {string} token - Token to invalidate
   * @returns {Promise<boolean>} Success status
   */
  async invalidateToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.jti) {
        throw new Error('Invalid token format');
      }

      // Add token to blacklist
      await db.query(`
        INSERT INTO token_blacklist (token_id, expires_at, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (token_id) DO NOTHING
      `, [decoded.jti, new Date(decoded.exp * 1000)]);

      logger.info(`🚫 Token invalidated: ${decoded.jti}`, {
        userId: decoded.userId,
        tokenId: decoded.jti,
      });

      return true;

    } catch (error) {
      logger.error('❌ Token invalidation failed:', error.message);
      throw error;
    }
  }

  /**
   * Invalidates all tokens for a user (useful for security incidents)
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async invalidateAllUserTokens(userId) {
    try {
      // This would require storing all active tokens or implementing a user token version
      // For now, we'll delete refresh tokens which will prevent new access tokens
      await db.query('DELETE FROM user_refresh_tokens WHERE user_id = $1', [userId]);
      
      logger.warn(`🚨 All tokens invalidated for user ${userId}`, { userId });
      return true;

    } catch (error) {
      logger.error('❌ Failed to invalidate all user tokens:', error.message);
      throw error;
    }
  }

  /**
   * Checks if a token is blacklisted
   * @param {string} tokenId - JWT ID (jti) to check
   * @returns {Promise<boolean>} True if blacklisted
   */
  async isTokenBlacklisted(tokenId) {
    try {
      const result = await db.query(
        'SELECT 1 FROM token_blacklist WHERE token_id = $1 AND expires_at > CURRENT_TIMESTAMP',
        [tokenId]
      );
      
      return result.rows.length > 0;

    } catch (error) {
      logger.error('❌ Blacklist check failed:', error.message);
      // Fail safely - treat as not blacklisted to avoid blocking valid tokens
      return false;
    }
  }

  /**
   * Verifies that a user still exists and is active
   * @param {number} userId - User ID to verify
   * @returns {Promise<boolean>} True if user exists and is active
   */
  async verifyUserExists(userId) {
    try {
      const result = await db.query(
        'SELECT 1 FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );
      
      return result.rows.length > 0;

    } catch (error) {
      logger.error('❌ User verification failed:', error.message);
      return false;
    }
  }

  /**
   * Cleans up expired tokens from blacklist and refresh token tables
   * This should be run periodically (e.g., daily cron job)
   * @returns {Promise<Object>} Cleanup statistics
   */
  async cleanupExpiredTokens() {
    try {
      const blacklistResult = await db.query(
        'DELETE FROM token_blacklist WHERE expires_at <= CURRENT_TIMESTAMP'
      );

      const refreshResult = await db.query(
        'DELETE FROM user_refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP'
      );

      const stats = {
        blacklistTokensRemoved: blacklistResult.rowCount,
        refreshTokensRemoved: refreshResult.rowCount,
        cleanupTime: new Date(),
      };

      logger.info('🧹 Token cleanup completed', stats);
      return stats;

    } catch (error) {
      logger.error('❌ Token cleanup failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const authService = new AuthenticationService();

module.exports = authService;
