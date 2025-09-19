/**
 * ===================================================
 * MAIN APPLICATION COMPONENT
 * React Router Configuration and Layout Management
 * ===================================================
 * 
 * This component serves as the main application shell, handling:
 * - Client-side routing with React Router
 * - Authentication-based route protection
 * - Global layout and navigation components
 * - Real-time connection management
 * - Loading states and error boundaries
 * 
 * ROUTE STRUCTURE:
 * - /login: Authentication page
 * - /register: User registration page
 * - /dashboard: Main incident map dashboard
 * - /incidents: Incident management interface
 * - /analytics: GIS analysis and reports
 * - /profile: User profile settings
 * 
 * DEPENDENCIES:
 * - React Router for navigation
 * - Authentication context for protected routes
 * - Socket.io context for real-time updates
 * - Material-UI components for layout
 * 
 * USAGE: Main application component rendered in index.js
 */

import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';

// Components
import Navbar from './components/Navigation/Navbar';
import LoadingScreen from './components/UI/LoadingScreen';
import ConnectionStatus from './components/UI/ConnectionStatus';

// Lazy load pages for better performance
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const IncidentsPage = React.lazy(() => import('./pages/IncidentsPage'));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));

/**
 * Loading fallback component for Suspense
 */
const PageLoader = () => (
  <Box
    display="flex"
    flexDirection="column"
    justifyContent="center"
    alignItems="center"
    minHeight="60vh"
    gap={2}
  >
    <CircularProgress size={40} />
    <Typography variant="body2" color="text.secondary">
      Loading page...
    </Typography>
  </Box>
);

/**
 * Protected Route wrapper component
 * Redirects unauthenticated users to login
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * Public Route wrapper component
 * Redirects authenticated users to dashboard
 */
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

/**
 * Main Application Component
 */
const App = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { connectionStatus, lastError, reconnect } = useSocket();

  // Show loading screen during initial authentication check
  if (authLoading) {
    return <LoadingScreen />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Navigation Bar - only show for authenticated users */}
      {isAuthenticated && <Navbar />}

      {/* Connection Status Indicator - only show after auth */}
      {isAuthenticated && ( 
        <ConnectionStatus status={connectionStatus} error={lastError} onReconnect={reconnect} />
      )}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          pt: isAuthenticated ? 0 : 0, // Account for navbar height
        }}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <RegisterPage />
                </PublicRoute>
              }
            />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/incidents"
              element={
                <ProtectedRoute>
                  <IncidentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Redirect root to appropriate page */}
            <Route
              path="/"
              element={
                <Navigate
                  to={isAuthenticated ? "/dashboard" : "/login"}
                  replace
                />
              }
            />

            {/* 404 - Not Found */}
            <Route
              path="*"
              element={
                <Box
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  minHeight="60vh"
                  textAlign="center"
                >
                  <Typography variant="h4" gutterBottom>
                    404 - Page Not Found
                  </Typography>
                  <Typography variant="body1" color="text.secondary" paragraph>
                    The page you're looking for doesn't exist.
                  </Typography>
                  <Typography variant="body2">
                    <a href={isAuthenticated ? "/dashboard" : "/login"}>
                      Return to {isAuthenticated ? "Dashboard" : "Login"}
                    </a>
                  </Typography>
                </Box>
              }
            />
          </Routes>
        </Suspense>
      </Box>

      {/* Global components can go here */}
      {/* For example: NotificationCenter, GlobalModals, etc. */}
    </Box>
  );
};

export default App;
