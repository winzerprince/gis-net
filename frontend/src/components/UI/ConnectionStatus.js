/**
 * ===================================================
 * CONNECTION STATUS COMPONENT
 * Real-Time Connection Status Indicator
 * ===================================================
 * 
 * Shows Socket.io connection status with visual feedback
 * and reconnection capabilities for user awareness.
 */

import React from 'react';
import { Alert, Chip, IconButton, Collapse } from '@mui/material';
import { 
  WifiOff, 
  Refresh, 
  Warning,
  CheckCircle 
} from '@mui/icons-material';
import { CONNECTION_STATUS } from '../../context/SocketContext';

const ConnectionStatus = ({ status, error, onReconnect }) => {
  const getStatusConfig = () => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          icon: <CheckCircle fontSize="small" />,
          label: 'Connected',
          color: 'success',
          severity: 'success',
          show: false, // Don't show when connected
        };
      
      case CONNECTION_STATUS.CONNECTING:
      case CONNECTION_STATUS.RECONNECTING:
        return {
          icon: <Refresh className="loading-spinner" fontSize="small" />,
          label: status === CONNECTION_STATUS.RECONNECTING ? 'Reconnecting...' : 'Connecting...',
          color: 'warning',
          severity: 'warning',
          show: true,
        };
      
      case CONNECTION_STATUS.ERROR:
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          icon: <WifiOff fontSize="small" />,
          label: 'Disconnected',
          color: 'error',
          severity: 'error',
          show: true,
        };
      
      default:
        return {
          icon: <Warning fontSize="small" />,
          label: 'Unknown Status',
          color: 'default',
          severity: 'info',
          show: true,
        };
    }
  };

  const config = getStatusConfig();

  if (!config.show) {
    return null;
  }

  return (
    <Collapse in={config.show}>
      <Alert 
        severity={config.severity}
        sx={{ 
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1300,
          minWidth: 280,
          boxShadow: 2,
        }}
        action={
          status === CONNECTION_STATUS.ERROR && (
            <IconButton
              color="inherit"
              size="small"
              onClick={onReconnect}
              title="Reconnect"
            >
              <Refresh fontSize="small" />
            </IconButton>
          )
        }
      >
        <Chip
          icon={config.icon}
          label={config.label}
          color={config.color}
          size="small"
          variant="outlined"
          sx={{ mr: 1 }}
        />
        {(
          error ? (
            <>
              Real-time updates unavailable: {String(error)}
              {status === CONNECTION_STATUS.ERROR && ' - Click refresh to retry'}
            </>
          ) : (
            'Real-time updates unavailable'
          )
        )}
      </Alert>
    </Collapse>
  );
};

export default ConnectionStatus;
