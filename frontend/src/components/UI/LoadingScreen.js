/**
 * ===================================================
 * LOADING SCREEN COMPONENT  
 * Full-Screen Loading Indicator
 * ===================================================
 * 
 * Displays a centered loading screen with GIS-NET branding
 * during authentication checks and app initialization.
 */

import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      bgcolor="background.default"
      gap={3}
    >
      <Box textAlign="center">
        <Typography 
          variant="h4" 
          component="h1" 
          fontWeight="bold" 
          color="primary.main"
          gutterBottom
        >
          GIS-NET
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" paragraph>
          Real-Time Traffic Incident Reporting
        </Typography>
      </Box>
      
      <CircularProgress size={48} thickness={4} />
      
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
};

export default LoadingScreen;
