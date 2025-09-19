/**
 * ===================================================
 * REACT APPLICATION ENTRY POINT
 * Main Entry for GIS-NET Frontend Application
 * ===================================================
 * 
 * This file initializes the React application with necessary providers:
 * - React Query for server state management
 * - Material-UI theme provider
 * - Authentication context provider
 * - React Router for client-side routing
 * - Error boundaries for graceful error handling
 * 
 * DEPENDENCIES:
 * - React 18+ with Concurrent Features
 * - Material-UI for consistent theming
 * - React Query for API state management
 * - React Router for navigation
 * - React Hot Toast for notifications
 * 
 * OUTPUTS: Rendered React application in DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ErrorFallback from './components/ErrorBoundary/ErrorFallback';
import './index.css';

// Create React Query client with optimized configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: (failureCount, error) => {
        // Don't retry for authentication errors
        if (error?.response?.status === 401) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        // Log mutation errors in development
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Mutation error:', error);
        }
      },
    },
  },
});

// Create Material-UI theme with GIS-NET branding
const theme = createTheme({
  palette: {
    primary: {
      main: '#2196f3', // Blue for maps and GIS
      light: '#64b5f6',
      dark: '#1976d2',
    },
    secondary: {
      main: '#ff9800', // Orange for alerts and incidents
      light: '#ffb74d',
      dark: '#f57c00',
    },
    error: {
      main: '#f44336', // Red for severe incidents
    },
    warning: {
      main: '#ff9800', // Orange for warnings
    },
    success: {
      main: '#4caf50', // Green for resolved incidents
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
  },
});

// Error handler for Error Boundary
const handleError = (error, errorInfo) => {
  // Log errors in development, send to monitoring in production
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.error('Application Error:', error);
    // eslint-disable-next-line no-console
    console.error('Error Info:', errorInfo);
  } else {
    // In production, send error to monitoring service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }
};

// Root component with all providers
const Root = () => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={() => {
        // Clear any cached state and refresh
        queryClient.clear();
        window.location.reload();
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter future={{ v7_relativeSplatPath: true }}>
            <AuthProvider>
              <SocketProvider>
                <App />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                    },
                    success: {
                      iconTheme: {
                        primary: '#4caf50',
                        secondary: '#fff',
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: '#f44336',
                        secondary: '#fff',
                      },
                    },
                  }}
                />
              </SocketProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
        {/* React Query DevTools - only in development */}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

// Create React 18 root and render application
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

root.render(<Root />);

// Performance monitoring (optional)
if (process.env.NODE_ENV === 'development') {
  // Dynamic import to avoid including in production bundle
  import('./reportWebVitals').then(({ default: reportWebVitals }) => {
    reportWebVitals((metric) => {
      // Log Web Vitals in development
      if (process.env.REACT_APP_DEBUG_MODE === 'true') {
        // eslint-disable-next-line no-console
        console.log('Web Vitals:', metric);
      }
    });
  });
}
