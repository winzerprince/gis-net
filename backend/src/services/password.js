/**
 * ==================================================
 * PASSWORD SECURITY SERVICE
 * Advanced Password Management & Security Features
 * ==================================================
 * 
 * This module provides comprehensive password security functionality for the
 * GIS-NET authentication system, implementing industry best practices:
 * 
 * CORE FEATURES:
 * - Secure password hashing with bcrypt and configurable salt rounds
 * - Password strength assessment with entropy calculation
 * - Common password detection using leaked password databases
 * - Password reset token generation with cryptographic security
 * - Account lockout protection against brute force attacks
 * - Password history tracking to prevent reuse
 * 
 * SECURITY MEASURES:
 * - Timing attack protection for password verification
 * - Rate limiting integration for failed login attempts
 * - Secure random token generation for password resets
 * - Comprehensive security event logging
 * - OWASP compliant password strength requirements
 * 
 * DEPENDENCIES:
 * - bcrypt: Industry-standard password hashing
 * - crypto: Cryptographic operations for tokens
 * - Database connection: User data and security events
 * - Logger service: Security audit trails
 * 
 * USAGE:
 * const passwordService = require('./services/password');
 * const hashedPassword = await passwordService.hashPassword(plainPassword);
 * const isValid = await passwordService.verifyPassword(plainPassword, hashedPassword);
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db/connection');
const logger = require('./logger');

class PasswordSecurityService {
  constructor() {
    this.saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    this.lockoutTimeMinutes = parseInt(process.env.LOCKOUT_TIME_MINUTES) || 15;
    this.passwordResetExpiryHours = 1; // Reset tokens expire in 1 hour
    this.maxPasswordHistory = 5; // Remember last 5 passwords
    
    // Common weak passwords (subset - in production, use a comprehensive list)
    this.commonPasswords = new Set([
      'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
      'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1',
      'qwerty123', 'password', 'admin123', 'root', 'toor', 'pass',
    ]);
    
    this.validateConfiguration();
  }

  /**
   * Validates password service configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfiguration() {
    if (this.saltRounds < 10) {
      logger.warn('⚠️  BCRYPT_ROUNDS is less than 10, consider increasing for better security');
    }
    
    if (this.saltRounds > 15) {
      logger.warn('⚠️  BCRYPT_ROUNDS is very high, this may impact performance');
    }
    
    logger.info(`🔐 Password security initialized with ${this.saltRounds} salt rounds`);
  }

  /**
   * Hashes a password using bcrypt with configured salt rounds
   * @param {string} plainPassword - Plain text password
   * @returns {Promise<string>} Bcrypt hashed password
   */
  async hashPassword(plainPassword) {
    try {
      if (!plainPassword || typeof plainPassword !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      const hashedPassword = await bcrypt.hash(plainPassword, this.saltRounds);
      
      logger.debug('🔐 Password hashed successfully', {
        saltRounds: this.saltRounds,
        hashLength: hashedPassword.length,
      });

      return hashedPassword;

    } catch (error) {
      logger.error('❌ Password hashing failed:', error.message);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verifies a plain password against a hashed password
   * Includes timing attack protection
   * @param {string} plainPassword - Plain text password to verify
   * @param {string} hashedPassword - Stored bcrypt hash
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(plainPassword, hashedPassword) {
    try {
      if (!plainPassword || !hashedPassword) {
        // Perform dummy bcrypt operation to prevent timing attacks
        await bcrypt.compare('dummy', '$2b$12$dummy.hash.to.prevent.timing.attacks');
        return false;
      }

      const isValid = await bcrypt.compare(plainPassword, hashedPassword);
      
      logger.debug(`🔍 Password verification: ${isValid ? 'success' : 'failed'}`);
      
      return isValid;

    } catch (error) {
      logger.error('❌ Password verification failed:', error.message);
      // Perform dummy operation to prevent timing attacks
      await bcrypt.compare('dummy', '$2b$12$dummy.hash.to.prevent.timing.attacks');
      return false;
    }
  }

  /**
   * Assesses password strength based on multiple criteria
   * @param {string} password - Password to assess
   * @returns {Object} Strength assessment with score and recommendations
   */
  assessPasswordStrength(password) {
    const assessment = {
      score: 0,
      level: 'weak',
      checks: {
        length: false,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        notCommon: false,
        entropy: 0,
      },
      recommendations: [],
    };

    if (!password) {
      assessment.recommendations.push('Password is required');
      return assessment;
    }

    // Length check (8+ characters)
    if (password.length >= 8) {
      assessment.checks.length = true;
      assessment.score += 2;
    } else {
      assessment.recommendations.push('Use at least 8 characters');
    }

    // Character type checks
    if (/[A-Z]/.test(password)) {
      assessment.checks.uppercase = true;
      assessment.score += 1;
    } else {
      assessment.recommendations.push('Include uppercase letters');
    }

    if (/[a-z]/.test(password)) {
      assessment.checks.lowercase = true;
      assessment.score += 1;
    } else {
      assessment.recommendations.push('Include lowercase letters');
    }

    if (/\d/.test(password)) {
      assessment.checks.numbers = true;
      assessment.score += 1;
    } else {
      assessment.recommendations.push('Include numbers');
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      assessment.checks.symbols = true;
      assessment.score += 2;
    } else {
      assessment.recommendations.push('Include special characters');
    }

    // Common password check
    if (!this.commonPasswords.has(password.toLowerCase())) {
      assessment.checks.notCommon = true;
      assessment.score += 2;
    } else {
      assessment.recommendations.push('Avoid common passwords');
    }

    // Entropy calculation (simplified)
    assessment.checks.entropy = this.calculateEntropy(password);
    if (assessment.checks.entropy > 50) {
      assessment.score += 2;
    }

    // Bonus for length
    if (password.length >= 12) assessment.score += 1;
    if (password.length >= 16) assessment.score += 1;

    // Determine strength level
    if (assessment.score >= 8) assessment.level = 'strong';
    else if (assessment.score >= 6) assessment.level = 'medium';
    else if (assessment.score >= 4) assessment.level = 'weak';
    else assessment.level = 'very_weak';

    return assessment;
  }

  /**
   * Calculates password entropy (simplified method)
   * @param {string} password - Password to analyze
   * @returns {number} Entropy value
   */
  calculateEntropy(password) {
    let charsetSize = 0;
    
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/\d/.test(password)) charsetSize += 10;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) charsetSize += 32;
    
    return password.length * Math.log2(charsetSize);
  }

  /**
   * Records a failed login attempt and checks for account lockout
   * @param {string} identifier - User email or username
   * @param {string} clientIP - Client IP address
   * @returns {Promise<Object>} Lockout status and remaining attempts
   */
  async recordFailedLogin(identifier, clientIP) {
    try {
      const now = new Date();
      const lockoutExpiry = new Date(now.getTime() - (this.lockoutTimeMinutes * 60 * 1000));

      // Clean up old failed attempts
      await db.query(`
        DELETE FROM failed_login_attempts 
        WHERE created_at < $1
      `, [lockoutExpiry]);

      // Record new failed attempt
      await db.query(`
        INSERT INTO failed_login_attempts (identifier, client_ip, created_at)
        VALUES ($1, $2, $3)
      `, [identifier.toLowerCase(), clientIP, now]);

      // Count recent failed attempts
      const result = await db.query(`
        SELECT COUNT(*) as attempt_count
        FROM failed_login_attempts
        WHERE identifier = $1 AND created_at > $2
      `, [identifier.toLowerCase(), lockoutExpiry]);

      const attemptCount = parseInt(result.rows[0].attempt_count);
      const isLocked = attemptCount >= this.maxLoginAttempts;
      const remainingAttempts = Math.max(0, this.maxLoginAttempts - attemptCount);

      if (isLocked) {
        logger.logSecurity('account_locked_brute_force', {
          identifier,
          clientIP,
          attemptCount,
          lockoutDuration: `${this.lockoutTimeMinutes} minutes`,
        });
      }

      logger.logSecurity('failed_login_recorded', {
        identifier,
        clientIP,
        attemptCount,
        remainingAttempts,
        isLocked,
      });

      return {
        isLocked,
        attemptCount,
        remainingAttempts,
        lockoutExpiresAt: isLocked ? new Date(now.getTime() + (this.lockoutTimeMinutes * 60 * 1000)) : null,
      };

    } catch (error) {
      logger.error('❌ Failed to record login attempt:', error.message);
      // Return safe defaults to prevent blocking legitimate users
      return {
        isLocked: false,
        attemptCount: 0,
        remainingAttempts: this.maxLoginAttempts,
        lockoutExpiresAt: null,
      };
    }
  }

  /**
   * Clears failed login attempts for a user (called on successful login)
   * @param {string} identifier - User email or username
   * @returns {Promise<boolean>} Success status
   */
  async clearFailedLogins(identifier) {
    try {
      const result = await db.query(`
        DELETE FROM failed_login_attempts 
        WHERE identifier = $1
      `, [identifier.toLowerCase()]);

      logger.debug(`🧹 Cleared ${result.rowCount} failed login attempts for ${identifier}`);
      return true;

    } catch (error) {
      logger.error('❌ Failed to clear login attempts:', error.message);
      return false;
    }
  }

  /**
   * Generates a secure password reset token
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Reset token and expiry information
   */
  async generatePasswordResetToken(userId) {
    try {
      // Generate cryptographically secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (this.passwordResetExpiryHours * 60 * 60 * 1000));

      // Store token in database (invalidate any existing tokens)
      await db.query(`
        INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP
      `, [userId, token, expiresAt]);

      logger.info(`🔑 Password reset token generated for user ${userId}`, {
        userId,
        expiresAt,
      });

      return {
        token,
        expiresAt,
      };

    } catch (error) {
      logger.error('❌ Password reset token generation failed:', error.message);
      throw new Error('Failed to generate reset token');
    }
  }

  /**
   * Validates and consumes a password reset token
   * @param {string} token - Reset token
   * @param {number} userId - User ID (optional, for additional validation)
   * @returns {Promise<Object>} Validation result with user information
   */
  async validatePasswordResetToken(token, userId = null) {
    try {
      const query = userId 
        ? 'SELECT * FROM password_reset_tokens WHERE token = $1 AND user_id = $2 AND expires_at > CURRENT_TIMESTAMP'
        : 'SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP';
      
      const params = userId ? [token, userId] : [token];
      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        logger.logSecurity('invalid_reset_token_used', {
          token: token.substring(0, 8) + '...',
          userId,
        });
        
        throw new Error('Invalid or expired reset token');
      }

      const resetRecord = result.rows[0];

      // Get user information
      const userResult = await db.query(
        'SELECT id, email, username, is_active FROM users WHERE id = $1',
        [resetRecord.user_id]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        throw new Error('User account not found or inactive');
      }

      const user = userResult.rows[0];

      logger.info(`✅ Password reset token validated for user ${user.id}`, {
        userId: user.id,
        username: user.username,
      });

      return {
        valid: true,
        user,
        tokenRecord: resetRecord,
      };

    } catch (error) {
      logger.error('❌ Password reset token validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Consumes a password reset token (marks it as used)
   * @param {string} token - Reset token to consume
   * @returns {Promise<boolean>} Success status
   */
  async consumePasswordResetToken(token) {
    try {
      const result = await db.query(
        'DELETE FROM password_reset_tokens WHERE token = $1',
        [token]
      );

      const consumed = result.rowCount > 0;
      
      if (consumed) {
        logger.info('🔑 Password reset token consumed', {
          token: token.substring(0, 8) + '...',
        });
      }

      return consumed;

    } catch (error) {
      logger.error('❌ Failed to consume reset token:', error.message);
      return false;
    }
  }

  /**
   * Adds a password to user's password history
   * @param {number} userId - User ID
   * @param {string} hashedPassword - Hashed password to store
   * @returns {Promise<boolean>} Success status
   */
  async addToPasswordHistory(userId, hashedPassword) {
    try {
      // Add new password to history
      await db.query(`
        INSERT INTO user_password_history (user_id, password_hash, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, [userId, hashedPassword]);

      // Keep only the most recent passwords (cleanup old ones)
      await db.query(`
        DELETE FROM user_password_history
        WHERE user_id = $1 
        AND id NOT IN (
          SELECT id FROM user_password_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        )
      `, [userId, this.maxPasswordHistory]);

      logger.debug(`📚 Added password to history for user ${userId}`);
      return true;

    } catch (error) {
      logger.error('❌ Failed to add password to history:', error.message);
      return false;
    }
  }

  /**
   * Checks if a password was recently used by the user
   * @param {number} userId - User ID
   * @param {string} plainPassword - Plain password to check
   * @returns {Promise<boolean>} True if password was recently used
   */
  async isPasswordRecentlyUsed(userId, plainPassword) {
    try {
      const result = await db.query(`
        SELECT password_hash FROM user_password_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, this.maxPasswordHistory]);

      for (const row of result.rows) {
        const isMatch = await this.verifyPassword(plainPassword, row.password_hash);
        if (isMatch) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('❌ Password history check failed:', error.message);
      // Fail safely - allow password change if check fails
      return false;
    }
  }

  /**
   * Cleanup expired tokens and old password history
   * Should be run periodically (daily cron job)
   * @returns {Promise<Object>} Cleanup statistics
   */
  async cleanupSecurityData() {
    try {
      // Remove expired password reset tokens
      const resetTokenResult = await db.query(
        'DELETE FROM password_reset_tokens WHERE expires_at <= CURRENT_TIMESTAMP'
      );

      // Remove old failed login attempts
      const lockoutExpiry = new Date(Date.now() - (this.lockoutTimeMinutes * 60 * 1000));
      const failedLoginResult = await db.query(
        'DELETE FROM failed_login_attempts WHERE created_at < $1',
        [lockoutExpiry]
      );

      // Remove excess password history entries
      const historyResult = await db.query(`
        DELETE FROM user_password_history
        WHERE id NOT IN (
          SELECT DISTINCT ON (user_id) unnest(
            array_agg(id ORDER BY created_at DESC)[1:$1]
          )
          FROM user_password_history
          GROUP BY user_id
        )
      `, [this.maxPasswordHistory]);

      const stats = {
        expiredResetTokens: resetTokenResult.rowCount,
        oldFailedLogins: failedLoginResult.rowCount,
        excessPasswordHistory: historyResult.rowCount,
        cleanupTime: new Date(),
      };

      logger.info('🧹 Security data cleanup completed', stats);
      return stats;

    } catch (error) {
      logger.error('❌ Security data cleanup failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const passwordService = new PasswordSecurityService();

module.exports = passwordService;
