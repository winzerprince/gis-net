/**
 * ===================================================
 * ERROR FALLBACK COMPONENT
 * User-Friendly Error Display
 * ===================================================
 * 
 * Displays when React Error Boundary catches errors,
 * provides user-friendly error message and recovery options.
 */

import React from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Alert, 
  Container, 
  Paper 
} from '@mui/material';
import { 
  ErrorOutline, 
  Refresh, 
  Home 
} from '@mui/icons-material';

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <Container maxWidth="md">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        py={4}
      >
        <Paper 
          elevation={3} 
          sx={{ 
            p: 4, 
            textAlign: 'center', 
            maxWidth: 600,
            width: '100%' 
          }}
        >
          <ErrorOutline 
            color="error" 
            sx={{ fontSize: 64, mb: 2 }} 
          />
          
          <Typography variant="h4" gutterBottom color="error">
            Oops! Something went wrong
          </Typography>
          
          <Typography variant="body1" color="text.secondary" paragraph>
            The application encountered an unexpected error. 
            This has been logged and our team will investigate.
          </Typography>

          {isDevelopment && (
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              <Typography variant="subtitle2" gutterBottom>
                Development Error Details:
              </Typography>
              <Typography variant="body2" component="pre" sx={{ 
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {error?.message}
              </Typography>
            </Alert>
          )}

          <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={resetErrorBoundary}
              size="large"
            >
              Try Again
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<Home />}
              onClick={() => window.location.href = '/'}
              size="large"
            >
              Go Home
            </Button>
          </Box>

          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ mt: 3, display: 'block' }}
          >
            If this problem persists, please contact support
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default ErrorFallback;
