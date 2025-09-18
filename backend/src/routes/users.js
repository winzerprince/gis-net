/**
 * ==================================================
 * USER PROFILE ROUTES
 * Express Router for User Management Operations
 * ==================================================
 * 
 * This module provides endpoints for user profile management operations
 * including viewing, updating, and managing user accounts. All routes
 * require authentication and implement proper ownership validation.
 * 
 * ROUTE STRUCTURE:
 * - GET /api/users/profile: Get current user's profile
 * - PUT /api/users/profile: Update current user's profile
 * - PUT /api/users/change-password: Change user password
 * - DELETE /api/users/account: Delete user account
 * - GET /api/users/activity: Get user activity history
 * - POST /api/users/avatar: Upload user avatar image
 * 
 * SECURITY FEATURES:
 * - Authentication required for all endpoints
 * - Profile ownership validation
 * - Input sanitization and validation
 * - Secure password change with old password verification
 * - Activity logging for security events
 * 
 * DEPENDENCIES:
 * - Express Router: Route definition
 * - Auth Middleware: JWT token verification
 * - Validation Middleware: Input validation
 * - Database Connection: User data operations
 * - Logger Service: Activity and security logging
 * 
 * USAGE:
 * const userRoutes = require('./routes/users');
 * app.use('/api/users', userRoutes);
 */

const express = require('express');
const { authenticateToken } = require('../middlewares/auth');
const {
  validateProfileUpdate,
  validatePasswordChange,
} = require('../middlewares/validation');
const DatabaseConnection = require('../db/connection');
const PasswordSecurityService = require('../services/password');
const logger = require('../services/logger');

const router = express.Router();
const db = new DatabaseConnection();
const passwordService = new PasswordSecurityService(db);

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's detailed profile information
 * @access  Private
 * @returns { user, statistics }
 */
router.get('/profile',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      logger.debug('User: Profile fetch request', {
        userId,
        username: req.user.username,
      });

      // Get detailed user information
      const userQuery = `
        SELECT 
          u.id,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          u.phone,
          u.role,
          u.is_active,
          u.email_verified,
          u.last_login,
          u.created_at,
          u.updated_at,
          COUNT(i.id) as reported_incidents
        FROM users u
        LEFT JOIN incidents i ON i.reported_by = u.id
        WHERE u.id = $1
        GROUP BY u.id
      `;

      const result = await db.query(userQuery, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User profile not found',
        });
      }

      const user = result.rows[0];

      // Get user activity statistics (last 30 days)
      const statsQuery = `
        SELECT 
          COUNT(*) as total_incidents,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as incidents_last_30_days,
          COUNT(CASE WHEN verified = true THEN 1 END) as verified_incidents,
          MAX(created_at) as last_incident_date
        FROM incidents 
        WHERE reported_by = $1
      `;

      const statsResult = await db.query(statsQuery, [userId]);
      const statistics = statsResult.rows[0];

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
          memberSince: user.created_at,
          lastUpdated: user.updated_at,
        },
        statistics: {
          totalIncidents: parseInt(statistics.total_incidents),
          incidentsLast30Days: parseInt(statistics.incidents_last_30_days),
          verifiedIncidents: parseInt(statistics.verified_incidents),
          lastIncidentDate: statistics.last_incident_date,
        }
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'get_user_profile',
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
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile information
 * @access  Private
 * @body    { firstName?, lastName?, phone?, username? }
 * @returns { user, message }
 */
router.put('/profile',
  authenticateToken,
  validateProfileUpdate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { firstName, lastName, phone, username } = req.body;

      logger.info('User: Profile update request', {
        userId,
        fields: Object.keys(req.body),
      });

      // Check if username is already taken (if being updated)
      if (username && username !== req.user.username) {
        const usernameCheck = await db.query(
          'SELECT id FROM users WHERE username = $1 AND id != $2',
          [username, userId]
        );

        if (usernameCheck.rows.length > 0) {
          return res.status(400).json({
            error: 'Username unavailable',
            message: 'This username is already taken',
          });
        }
      }

      // Update user profile
      const updateQuery = `
        UPDATE users 
        SET 
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          username = COALESCE($4, username),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING id, username, email, first_name, last_name, phone, updated_at
      `;

      const result = await db.query(updateQuery, [
        firstName || null,
        lastName || null,
        phone || null,
        username || null,
        userId
      ]);

      const updatedUser = result.rows[0];

      logger.info('User: Profile updated successfully', {
        userId,
        username: updatedUser.username,
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          phone: updatedUser.phone,
          lastUpdated: updatedUser.updated_at,
        }
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'update_user_profile',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Profile update failed',
        message: 'Unable to update user profile',
      });
    }
  }
);

/**
 * @route   PUT /api/users/change-password
 * @desc    Change user's password with security validation
 * @access  Private
 * @body    { currentPassword, newPassword, confirmNewPassword }
 * @returns { success, message }
 */
router.put('/change-password',
  authenticateToken,
  validatePasswordChange,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      logger.info('User: Password change request', {
        userId,
        username: req.user.username,
      });

      // Verify current password
      const userQuery = 'SELECT password FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User account not found',
        });
      }

      const isCurrentPasswordValid = await passwordService.verifyPassword(
        currentPassword,
        userResult.rows[0].password
      );

      if (!isCurrentPasswordValid) {
        // Log failed password change attempt
        logger.logSecurity('password_change_failed_verification', {
          userId,
          ip: req.ip,
        }, req);

        return res.status(400).json({
          error: 'Invalid password',
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const hashedNewPassword = await passwordService.hashPassword(newPassword);

      // Update password in database
      const updateQuery = `
        UPDATE users 
        SET 
          password = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await db.query(updateQuery, [hashedNewPassword, userId]);

      // Log successful password change
      logger.logSecurity('password_changed', {
        userId,
        username: req.user.username,
      }, req);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'change_password',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Password change failed',
        message: 'Unable to change password',
      });
    }
  }
);

/**
 * @route   DELETE /api/users/account
 * @desc    Delete user account (soft delete)
 * @access  Private
 * @body    { password, reason? }
 * @returns { success, message }
 */
router.delete('/account',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { password, reason } = req.body;

      if (!password) {
        return res.status(400).json({
          error: 'Password required',
          message: 'Password confirmation is required to delete account',
        });
      }

      logger.info('User: Account deletion request', {
        userId,
        username: req.user.username,
        reason,
      });

      // Verify password before deletion
      const userQuery = 'SELECT password FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User account not found',
        });
      }

      const isPasswordValid = await passwordService.verifyPassword(
        password,
        userResult.rows[0].password
      );

      if (!isPasswordValid) {
        logger.logSecurity('account_deletion_failed_verification', {
          userId,
          ip: req.ip,
        }, req);

        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password is incorrect',
        });
      }

      // Soft delete: deactivate account instead of hard delete
      const deleteQuery = `
        UPDATE users 
        SET 
          is_active = false,
          email = CONCAT('deleted_', id, '@deleted.local'),
          username = CONCAT('deleted_', id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await db.query(deleteQuery, [userId]);

      // Log account deletion
      logger.logSecurity('account_deleted', {
        userId,
        username: req.user.username,
        reason,
      }, req);

      res.json({
        success: true,
        message: 'Account has been deactivated successfully',
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'delete_account',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Account deletion failed',
        message: 'Unable to delete account',
      });
    }
  }
);

/**
 * @route   GET /api/users/activity
 * @desc    Get user's recent activity and incident history
 * @access  Private
 * @query   ?page=1&limit=20&type=all
 * @returns { activities, pagination }
 */
router.get('/activity',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = (page - 1) * limit;

      logger.debug('User: Activity history request', {
        userId,
        page,
        limit,
      });

      // Get user's incident activity
      const activityQuery = `
        SELECT 
          i.id,
          i.description,
          i.severity,
          i.created_at,
          i.verified,
          ST_X(i.location) as longitude,
          ST_Y(i.location) as latitude,
          it.name as incident_type
        FROM incidents i
        JOIN incident_types it ON it.id = i.type_id
        WHERE i.reported_by = $1
        ORDER BY i.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM incidents
        WHERE reported_by = $1
      `;

      const [activityResult, countResult] = await Promise.all([
        db.query(activityQuery, [userId, limit, offset]),
        db.query(countQuery, [userId])
      ]);

      const activities = activityResult.rows.map(row => ({
        id: row.id,
        type: 'incident_report',
        description: row.description,
        incidentType: row.incident_type,
        severity: row.severity,
        location: {
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        },
        verified: row.verified,
        createdAt: row.created_at,
      }));

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        activities,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        }
      });

    } catch (error) {
      logger.logError(error, req, { 
        operation: 'get_user_activity',
        userId: req.user?.id,
      });

      res.status(500).json({
        error: 'Activity retrieval failed',
        message: 'Unable to retrieve activity history',
      });
    }
  }
);

module.exports = router;
