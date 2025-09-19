/**
 * ===================================================
 * AUTHENTICATION SERVICE
 * API Client for User Authentication Operations
 * ===================================================
 * 
 * This service provides methods for authentication-related API calls:
 * - User login and registration
 * - JWT token management and refresh
 * - User profile operations
 * - Session management
 * - Automatic token injection for authenticated requests
 * 
 * FEATURES:
 * - Axios HTTP client with interceptors
 * - Automatic JWT token injection
 * - Token refresh on 401 responses
 * - Request/response error handling
 * - Base URL configuration
 * 
 * DEPENDENCIES:
 * - Axios for HTTP requests
 * - Environment variables for API URL configuration
 * 
 * USAGE:
 * import { authService } from './authService';
 * const response = await authService.login(email, password);
 */

import axios from 'axios';

// Base API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

/**
 * Authentication Service Class
 * Handles all authentication-related API operations
 */
class AuthenticationService {
  constructor() {
    // Create axios instance with base configuration
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.apiClient.interceptors.request.use(
      (config) => {
        const token = this.getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle token expiration (401 Unauthorized)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('gis_net_refresh_token');
            if (refreshToken) {
              const response = await this.refreshToken(refreshToken);
              const newToken = response.data.accessToken;
              
              // Update stored token
              localStorage.setItem('gis_net_token', newToken);
              this.setToken(newToken);
              
              // Retry original request with new token
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.apiClient(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed - redirect to login
            this.handleAuthenticationFailure();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    this.currentToken = null;
  }

  /**
   * Get stored authentication token
   * @returns {string|null} Stored token
   */
  getStoredToken() {
    return localStorage.getItem('gis_net_token') || this.currentToken;
  }

  /**
   * Set authentication token for requests
   * @param {string} token - JWT token
   */
  setToken(token) {
    this.currentToken = token;
    if (token) {
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.apiClient.defaults.headers.common['Authorization'];
    }
  }

  /**
   * Clear authentication token
   */
  clearToken() {
    this.currentToken = null;
    delete this.apiClient.defaults.headers.common['Authorization'];
  }

  /**
   * Handle authentication failure (logout user)
   */
  handleAuthenticationFailure() {
    // Clear stored auth data
    localStorage.removeItem('gis_net_token');
    localStorage.removeItem('gis_net_refresh_token');
    localStorage.removeItem('gis_net_user');
    
    // Clear service token
    this.clearToken();
    
    // Redirect to login (in a real app, you might use router)
    window.location.href = '/login';
  }

  // ==============================================
  // AUTHENTICATION API METHODS
  // ==============================================

  /**
   * User login
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {boolean} rememberMe - Remember login
   * @returns {Promise} API response
   */
  async login(email, password, rememberMe = false) {
    const response = await this.apiClient.post('/auth/login', {
      email,
      password,
      rememberMe,
    });

    return response;
  }

  /**
   * User registration
   * @param {Object} userData - Registration data
   * @returns {Promise} API response
   */
  async register(userData) {
    const response = await this.apiClient.post('/auth/register', userData);
    return response;
  }

  /**
   * User logout
   * @returns {Promise} API response
   */
  async logout() {
    try {
      const response = await this.apiClient.post('/auth/logout');
      return response;
    } finally {
      // Always clear local data, even if API call fails
      this.clearToken();
    }
  }

  /**
   * Refresh authentication token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise} API response
   */
  async refreshToken(refreshToken) {
    // Don't use interceptor for refresh token call to avoid infinite loop
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
    });

    return response;
  }

  /**
   * Get current user profile
   * @returns {Promise} API response
   */
  async getCurrentUser() {
    const response = await this.apiClient.get('/auth/me');
    return response;
  }

  /**
   * Update user profile
   * @param {Object} updates - Profile updates
   * @returns {Promise} API response
   */
  async updateProfile(updates) {
    const response = await this.apiClient.put('/auth/profile', updates);
    return response;
  }

  /**
   * Change user password
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise} API response
   */
  async changePassword(currentPassword, newPassword) {
    const response = await this.apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });

    return response;
  }

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Promise} API response
   */
  async requestPasswordReset(email) {
    const response = await this.apiClient.post('/auth/forgot-password', {
      email,
    });

    return response;
  }

  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} password - New password
   * @returns {Promise} API response
   */
  async resetPassword(token, password) {
    const response = await this.apiClient.post('/auth/reset-password', {
      token,
      password,
    });

    return response;
  }

  /**
   * Verify email address
   * @param {string} token - Verification token
   * @returns {Promise} API response
   */
  async verifyEmail(token) {
    const response = await this.apiClient.post('/auth/verify-email', {
      token,
    });

    return response;
  }

  /**
   * Resend email verification
   * @returns {Promise} API response
   */
  async resendEmailVerification() {
    const response = await this.apiClient.post('/auth/resend-verification');
    return response;
  }

  // ==============================================
  // UTILITY METHODS
  // ==============================================

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    const token = this.getStoredToken();
    if (!token) return false;

    try {
      // Simple token expiration check (decode JWT payload)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      
      return payload.exp > currentTime;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user from stored token
   * @returns {Object|null} User object
   */
  getUserFromToken() {
    try {
      const token = this.getStoredToken();
      if (!token) return null;

      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.userId,
        username: payload.username,
        email: payload.email,
        role: payload.role,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is blacklisted (stub for backend integration)
   * @param {string} token - JWT token
   * @returns {Promise<boolean>} Blacklist status
   */
  async isTokenBlacklisted(token) {
    try {
      const response = await this.apiClient.post('/auth/check-token', { token });
      return response.data.isBlacklisted || false;
    } catch (error) {
      // If check fails, assume token is valid
      return false;
    }
  }

  /**
   * Get user by ID (admin function)
   * @param {number} userId - User ID
   * @returns {Promise} API response
   */
  async getUserById(userId) {
    const response = await this.apiClient.get(`/users/${userId}`);
    return response.data.user;
  }
}

// Create and export singleton instance
export const authService = new AuthenticationService();

export default AuthenticationService;
