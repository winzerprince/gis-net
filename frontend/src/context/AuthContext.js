/**
 * ===================================================
 * AUTHENTICATION CONTEXT PROVIDER
 * Centralized Auth State Management with JWT
 * ===================================================
 * 
 * This context manages user authentication state across the application:
 * - JWT token storage and validation
 * - User login/logout functionality  
 * - Automatic token refresh
 * - Protected route authentication
 * - User profile management
 * 
 * FEATURES:
 * - Persistent authentication state via localStorage
 * - Automatic token expiration handling
 * - Login/logout with proper cleanup
 * - User profile information management
 * - Authentication loading states
 * 
 * DEPENDENCIES:
 * - React Context API for state management
 * - Auth service for API communication
 * - localStorage for token persistence
 * - JWT decode for token validation
 * 
 * USAGE:
 * const { user, login, logout, isAuthenticated } = useAuth();
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../services/authService';
import { toast } from 'react-hot-toast';

// Initial authentication state
const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Action types for authentication reducer
const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  REFRESH_TOKEN_SUCCESS: 'REFRESH_TOKEN_SUCCESS',
  REFRESH_TOKEN_FAILURE: 'REFRESH_TOKEN_FAILURE',
  UPDATE_USER: 'UPDATE_USER',
  SET_LOADING: 'SET_LOADING',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

/**
 * Authentication state reducer
 * @param {Object} state - Current authentication state
 * @param {Object} action - Action with type and payload
 * @returns {Object} New authentication state
 */
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
      };

    case AUTH_ACTIONS.REFRESH_TOKEN_SUCCESS:
      return {
        ...state,
        token: action.payload.token,
        user: action.payload.user || state.user,
        error: null,
      };

    case AUTH_ACTIONS.REFRESH_TOKEN_FAILURE:
      return {
        ...initialState,
        isLoading: false,
        error: action.payload,
      };

    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };

    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

// Create Authentication Context
const AuthContext = createContext();

/**
 * Authentication Context Provider Component
 * @param {Object} children - Child components
 */
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /**
   * Initialize authentication state from localStorage
   */
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem('gis_net_token');
        const storedRefreshToken = localStorage.getItem('gis_net_refresh_token');
        const storedUser = localStorage.getItem('gis_net_user');

        if (storedToken && storedRefreshToken && storedUser) {
          // Validate stored token and get current user
          authService.setToken(storedToken);
          
          try {
            const response = await authService.getCurrentUser();
            
            dispatch({
              type: AUTH_ACTIONS.LOGIN_SUCCESS,
              payload: {
                user: response.data.user,
                token: storedToken,
                refreshToken: storedRefreshToken,
              },
            });
          } catch (error) {
            // Token might be expired, try refresh
            if (error.response?.status === 401) {
              await refreshToken();
            } else {
              // Clear invalid stored data
              clearAuthData();
              dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
            }
          }
        } else {
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } catch (error) {
        // Auth initialization error - clear data and continue
        clearAuthData();
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    initializeAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Clear authentication data from localStorage
   */
  const clearAuthData = () => {
    localStorage.removeItem('gis_net_token');
    localStorage.removeItem('gis_net_refresh_token');
    localStorage.removeItem('gis_net_user');
    authService.clearToken();
  };

  /**
   * Store authentication data in localStorage
   */
  const storeAuthData = (token, refreshToken, user) => {
    localStorage.setItem('gis_net_token', token);
    localStorage.setItem('gis_net_refresh_token', refreshToken);
    localStorage.setItem('gis_net_user', JSON.stringify(user));
    authService.setToken(token);
  };

  /**
   * User login function
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {boolean} rememberMe - Whether to remember login
   * @returns {Promise<boolean>} Success status
   */
  const login = async (email, password, rememberMe = false) => {
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await authService.login(email, password, rememberMe);
      const { user, tokens } = response.data;

      // Store authentication data
      storeAuthData(tokens.accessToken, tokens.refreshToken, user);

      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: {
          user,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });

      toast.success(`Welcome back, ${user.username}!`);
      return true;

    } catch (error) {
      const apiErr = error.response?.data;
      const detailMsg = Array.isArray(apiErr?.details) && apiErr.details.length
        ? apiErr.details[0]?.message
        : apiErr?.error || apiErr?.message;
      const errorMessage = detailMsg || 'Login failed';
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage,
      });

      toast.error(errorMessage);
      return false;
    }
  };

  /**
   * User registration function
   * @param {Object} userData - Registration data
   * @returns {Promise<boolean>} Success status
   */
  const register = async (userData) => {
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await authService.register(userData);
      const { user, tokens } = response.data;

      // Store authentication data
      storeAuthData(tokens.accessToken, tokens.refreshToken, user);

      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: {
          user,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });

      toast.success(`Welcome to GIS-NET, ${user.username}!`);
      return true;

    } catch (error) {
      const apiErr = error.response?.data;
      const detailMsg = Array.isArray(apiErr?.details) && apiErr.details.length
        ? apiErr.details[0]?.message
        : apiErr?.error || apiErr?.message;
      const errorMessage = detailMsg || 'Registration failed';
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage,
      });

      toast.error(errorMessage);
      return false;
    }
  };

  /**
   * User logout function
   */
  const logout = async () => {
    try {
      // Call logout endpoint to invalidate tokens on server
      await authService.logout();
    } catch (error) {
      // Logout API call failed - continue with local logout
      // Continue with local logout even if API call fails
    }

    // Clear local authentication data
    clearAuthData();
    
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
    
    toast.success('Logged out successfully');
  };

  /**
   * Refresh authentication token
   */
  const refreshToken = async () => {
    try {
      const storedRefreshToken = localStorage.getItem('gis_net_refresh_token');
      
      if (!storedRefreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await authService.refreshToken(storedRefreshToken);
      const { accessToken, user } = response.data;

      // Update stored token
      localStorage.setItem('gis_net_token', accessToken);
      authService.setToken(accessToken);

      dispatch({
        type: AUTH_ACTIONS.REFRESH_TOKEN_SUCCESS,
        payload: {
          token: accessToken,
          user,
        },
      });

      return true;

    } catch (error) {
      // Token refresh failed - clear auth data and redirect to login
      clearAuthData();
      
      dispatch({
        type: AUTH_ACTIONS.REFRESH_TOKEN_FAILURE,
        payload: 'Session expired. Please log in again.',
      });

      toast.error('Session expired. Please log in again.');
      return false;
    }
  };

  /**
   * Update user profile
   * @param {Object} updates - User profile updates
   */
  const updateUser = (updates) => {
    dispatch({
      type: AUTH_ACTIONS.UPDATE_USER,
      payload: updates,
    });

    // Update localStorage
    const updatedUser = { ...state.user, ...updates };
    localStorage.setItem('gis_net_user', JSON.stringify(updatedUser));
  };

  /**
   * Clear authentication error
   */
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Context value object
  const contextValue = {
    // State
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,

    // Actions
    login,
    register,
    logout,
    refreshToken,
    updateUser,
    clearError,

    // Utilities
    isAdmin: state.user?.role === 'admin',
    isModerator: ['admin', 'moderator'].includes(state.user?.role),
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to use authentication context
 * @returns {Object} Authentication context value
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthContext;
