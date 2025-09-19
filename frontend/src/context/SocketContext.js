/**
 * ===================================================
 * SOCKET.IO CONTEXT PROVIDER
 * Real-Time Communication Management
 * ===================================================
 * 
 * This context manages Socket.io connections for real-time features:
 * - Automatic connection/disconnection based on auth state
 * - Real-time incident updates and notifications
 * - Geographic area subscriptions for location-based updates
 * - Connection status monitoring and error handling
 * - Event broadcasting and listening management
 * 
 * FEATURES:
 * - Authenticated WebSocket connections
 * - Automatic reconnection with exponential backoff
 * - Geographic area subscription management
 * - Real-time incident event handling
 * - Connection status indicators
 * - Error recovery and user notifications
 * 
 * DEPENDENCIES:
 * - Socket.io client for WebSocket communication
 * - Authentication context for user token
 * - React toast for user notifications
 * 
 * USAGE:
 * const { socket, connectionStatus, subscribeToArea } = useSocket();
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';

// Socket connection status constants
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  RECONNECTING: 'reconnecting',
};

// Create Socket Context
const SocketContext = createContext();

/**
 * Socket Context Provider Component
 * @param {Object} children - Child components
 */
export const SocketProvider = ({ children }) => {
  const { isAuthenticated, token, user } = useAuth();
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [subscribedAreas, setSubscribedAreas] = useState(new Set());
  const [lastError, setLastError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Maximum reconnection attempts
  const MAX_RECONNECT_ATTEMPTS = 5;
  
  // Base reconnection delay (increases exponentially)
  const BASE_RECONNECT_DELAY = 1000;

  /**
   * Initialize Socket.io connection
   */
  const initializeSocket = useCallback(() => {
    if (!isAuthenticated || !token || socketRef.current) {
      return;
    }

    setConnectionStatus(CONNECTION_STATUS.CONNECTING);

    // Create socket connection with authentication
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:4000', {
      auth: {
        token: token,
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      setConnectionStatus(CONNECTION_STATUS.CONNECTED);
      setLastError(null);
      setReconnectAttempts(0);
      
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    socket.on('disconnect', (reason) => {
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - don't auto-reconnect
        setLastError('Server disconnected the connection');
      } else {
        // Client-side disconnect or network issue - attempt reconnect
        handleReconnection();
      }
    });

    socket.on('connect_error', (error) => {
      setConnectionStatus(CONNECTION_STATUS.ERROR);
      setLastError(error.message || 'Connection error');
      handleReconnection();
    });

    // Authentication-related events
    socket.on('authenticated', (data) => {
      toast.success('Connected to real-time updates');
    });

    socket.on('auth_error', (error) => {
      setLastError('Authentication failed');
      toast.error('Real-time connection authentication failed');
    });

    // Real-time incident events
    socket.on('new-incident', (data) => {
      handleNewIncident(data);
    });

    socket.on('incident-updated', (data) => {
      handleIncidentUpdate(data);
    });

    socket.on('incident-deleted', (data) => {
      handleIncidentDeletion(data);
    });

    socket.on('incident-verified', (data) => {
      handleIncidentVerification(data);
    });

    // Area-specific incident events
    socket.on('area-incident', (data) => {
      handleAreaIncident(data);
    });

    // User-specific notifications
    socket.on('user-notification', (data) => {
      handleUserNotification(data);
    });

    // Area subscription confirmations
    socket.on('area_subscribed', (data) => {
      setSubscribedAreas(prev => new Set([...prev, data.roomName]));
      toast.success('Subscribed to area updates');
    });

    socket.on('area_unsubscribed', (data) => {
      setSubscribedAreas(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.roomName);
        return newSet;
      });
    });

    // Socket error handling
    socket.on('error', (error) => {
      setLastError(error.message || 'Socket error');
      toast.error(`Connection error: ${error.message}`);
    });

  }, [isAuthenticated, token]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Handle socket reconnection with exponential backoff
   */
  const handleReconnection = useCallback(() => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus(CONNECTION_STATUS.ERROR);
      setLastError('Maximum reconnection attempts exceeded');
      toast.error('Unable to establish real-time connection');
      return;
    }

    setConnectionStatus(CONNECTION_STATUS.RECONNECTING);
    
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      initializeSocket();
    }, delay);

  }, [reconnectAttempts, initializeSocket]);

  /**
   * Cleanup socket connection
   */
  const cleanupSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
    setSubscribedAreas(new Set());
    setReconnectAttempts(0);
    setLastError(null);
  }, []);

  /**
   * Handle new incident notifications
   */
  const handleNewIncident = useCallback((data) => {
    // Dispatch custom event for incident list updates
    window.dispatchEvent(new CustomEvent('incident-created', { detail: data }));
    
    if (data.incident.reportedBy !== user?.id) {
      toast.success(`New incident reported: ${data.incident.description?.substring(0, 50)}...`);
    }
  }, [user?.id]);

  /**
   * Handle incident update notifications
   */
  const handleIncidentUpdate = useCallback((data) => {
    window.dispatchEvent(new CustomEvent('incident-updated', { detail: data }));
    
    if (data.incident.reportedBy === user?.id) {
      toast.info('Your incident report has been updated');
    }
  }, [user?.id]);

  /**
   * Handle incident deletion notifications
   */
  const handleIncidentDeletion = useCallback((data) => {
    window.dispatchEvent(new CustomEvent('incident-deleted', { detail: data }));
    
    if (data.deletedBy !== user?.id) {
      toast.info('An incident has been resolved');
    }
  }, [user?.id]);

  /**
   * Handle incident verification notifications
   */
  const handleIncidentVerification = useCallback((data) => {
    window.dispatchEvent(new CustomEvent('incident-verified', { detail: data }));
    
    toast.success('Incident verification updated');
  }, []);

  /**
   * Handle area-specific incident notifications
   */
  const handleAreaIncident = useCallback((data) => {
    toast.info(`New incident in your subscribed area: ${data.incident.description?.substring(0, 30)}...`);
  }, []);

  /**
   * Handle user-specific notifications
   */
  const handleUserNotification = useCallback((notification) => {
    switch (notification.type) {
      case 'incident_comment':
        toast.info('New comment on your incident');
        break;
      case 'incident_status_change':
        toast.info('Your incident status has been updated');
        break;
      case 'verification_milestone':
        toast.success(`Your incident has received ${notification.count} verifications!`);
        break;
      default:
        toast.info(notification.message);
    }
  }, []);

  /**
   * Subscribe to geographic area updates
   * @param {Object} bounds - Area bounds {north, south, east, west}
   */
  const subscribeToArea = useCallback((bounds) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('subscribe_area', { bounds });
    }
  }, []);

  /**
   * Unsubscribe from geographic area updates
   * @param {string} roomName - Area room name to unsubscribe from
   */
  const unsubscribeFromArea = useCallback((roomName) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('unsubscribe_area', { roomName });
    }
  }, []);

  /**
   * Manually reconnect socket
   */
  const reconnect = useCallback(() => {
    cleanupSocket();
    setReconnectAttempts(0);
    initializeSocket();
  }, [cleanupSocket, initializeSocket]);

  // Effect to manage socket connection based on authentication
  useEffect(() => {
    if (isAuthenticated && token) {
      initializeSocket();
    } else {
      cleanupSocket();
    }

    // Cleanup on unmount
    return cleanupSocket;
  }, [isAuthenticated, token, initializeSocket, cleanupSocket]);

  // Context value object
  const contextValue = {
    // Connection state
    socket: socketRef.current,
    connectionStatus,
    lastError,
    isConnected: connectionStatus === CONNECTION_STATUS.CONNECTED,
    isConnecting: connectionStatus === CONNECTION_STATUS.CONNECTING,
    isReconnecting: connectionStatus === CONNECTION_STATUS.RECONNECTING,
    subscribedAreas,
    reconnectAttempts,

    // Connection methods
    reconnect,
    subscribeToArea,
    unsubscribeFromArea,

    // Utility methods
    emit: (event, data) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(event, data);
      }
    },
    
    on: (event, callback) => {
      if (socketRef.current) {
        socketRef.current.on(event, callback);
      }
    },
    
    off: (event, callback) => {
      if (socketRef.current) {
        socketRef.current.off(event, callback);
      }
    },
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Custom hook to use socket context
 * @returns {Object} Socket context value
 */
export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  
  return context;
};

export default SocketContext;
