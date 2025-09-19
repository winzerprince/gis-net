/**
 * ===================================================
 * NAVIGATION BAR COMPONENT
 * Main Application Navigation Header
 * ===================================================
 * 
 * Provides navigation links, user menu, and logout functionality.
 * Responsive design with mobile menu support.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Dashboard,
  ReportProblem,
  Analytics,
  Person,
  ExitToApp,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const [anchorEl, setAnchorEl] = useState(null);

  const navigationItems = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: <Dashboard fontSize="small" />,
    },
    {
      label: 'Incidents',
      path: '/incidents',
      icon: <ReportProblem fontSize="small" />,
    },
    {
      label: 'Analytics',
      path: '/analytics',
      icon: <Analytics fontSize="small" />,
    },
  ];

  const handleUserMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNavigation = (path) => {
    navigate(path);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
  };

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        {/* Brand/Logo */}
        <Typography 
          variant="h6" 
          component="div" 
          sx={{ 
            flexGrow: 0, 
            fontWeight: 'bold',
            mr: 4,
            cursor: 'pointer'
          }}
          onClick={() => navigate('/dashboard')}
        >
          GIS-NET
        </Typography>

        {/* Navigation Links */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
          {navigationItems.map((item) => (
            <Button
              key={item.path}
              startIcon={item.icon}
              color="inherit"
              onClick={() => handleNavigation(item.path)}
              variant={isActivePath(item.path) ? 'outlined' : 'text'}
              sx={{
                borderColor: isActivePath(item.path) ? 'rgba(255,255,255,0.3)' : 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>

        {/* Connection Status Indicator */}
        <Box sx={{ mr: 2 }}>
          <Tooltip title={isConnected ? 'Real-time updates active' : 'Real-time updates offline'}>
            <Chip
              label={isConnected ? 'Live' : 'Offline'}
              size="small"
              color={isConnected ? 'success' : 'error'}
              variant="outlined"
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.3)',
                fontSize: '0.75rem',
              }}
            />
          </Tooltip>
        </Box>

        {/* User Menu */}
        <Box>
          <Tooltip title="User Menu">
            <IconButton
              color="inherit"
              onClick={handleUserMenuOpen}
              sx={{
                p: 0.5,
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <Avatar
                sx={{ 
                  width: 32, 
                  height: 32,
                  bgcolor: 'secondary.main',
                  fontSize: '1rem',
                }}
              >
                {user?.username?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 200,
              },
            }}
          >
            {/* User Info Header */}
            <MenuItem disabled>
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  {user?.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
                {user?.role && user.role !== 'user' && (
                  <Chip 
                    label={user.role} 
                    size="small" 
                    color="primary" 
                    sx={{ mt: 0.5 }}
                  />
                )}
              </Box>
            </MenuItem>

            {/* Menu Items */}
            <MenuItem onClick={() => { handleNavigation('/profile'); handleUserMenuClose(); }}>
              <Person fontSize="small" sx={{ mr: 2 }} />
              Profile Settings
            </MenuItem>

            <MenuItem onClick={handleLogout}>
              <ExitToApp fontSize="small" sx={{ mr: 2 }} />
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
