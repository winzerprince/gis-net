/**
 * ===================================================
 * DASHBOARD PAGE COMPONENT
 * Main GIS Mapping Interface
 * ===================================================
 * 
 * Primary application interface featuring interactive maps,
 * incident reporting, and real-time updates. This will be
 * enhanced with Leaflet mapping in subsequent iterations.
 */

import React from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
} from '@mui/material';
import {
  Map,
  Add,
  Timeline,
  Notifications,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const DashboardPage = () => {
  const { user } = useAuth();
  const { isConnected } = useSocket();

  const dashboardStats = [
    {
      title: 'Active Incidents',
      value: '12',
      icon: <Map color="primary" />,
      color: 'primary',
    },
    {
      title: 'My Reports',
      value: '3',
      icon: <Add color="secondary" />,
      color: 'secondary',
    },
    {
      title: 'Analytics',
      value: 'View',
      icon: <Timeline color="success" />,
      color: 'success',
    },
    {
      title: 'Notifications',
      value: '5',
      icon: <Notifications color="warning" />,
      color: 'warning',
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Welcome back, {user?.username}! Monitor and report traffic incidents in real-time.
        </Typography>
        
        <Box display="flex" gap={2} alignItems="center">
          <Chip
            label={isConnected ? 'Real-time Updates Active' : 'Offline Mode'}
            color={isConnected ? 'success' : 'error'}
            variant="outlined"
          />
          <Chip
            label={`Role: ${user?.role || 'User'}`}
            color="primary"
            variant="outlined"
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Quick Stats */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Quick Overview
          </Typography>
          <Grid container spacing={2}>
            {dashboardStats.map((stat, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    cursor: 'pointer',
                    '&:hover': {
                      boxShadow: 4,
                    },
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          {stat.title}
                        </Typography>
                        <Typography variant="h4" component="div">
                          {stat.value}
                        </Typography>
                      </Box>
                      {stat.icon}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Map Placeholder */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, minHeight: 400 }}>
            <Typography variant="h6" gutterBottom>
              Interactive Map
            </Typography>
            <Box
              sx={{
                height: 350,
                bgcolor: 'grey.100',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 2,
                border: '2px dashed',
                borderColor: 'grey.300',
                borderRadius: 1,
              }}
            >
              <Map sx={{ fontSize: 60, color: 'grey.400' }} />
              <Typography variant="h6" color="grey.500">
                Interactive Leaflet Map
              </Typography>
              <Typography variant="body2" color="grey.500" textAlign="center">
                Real-time incident mapping with clustering, heatmaps,<br />
                and geographic area subscriptions coming soon
              </Typography>
              <Button variant="outlined" startIcon={<Add />}>
                Report New Incident
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} lg={4}>
          <Box display="flex" flexDirection="column" gap={2}>
            {/* Recent Activity */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Typography variant="body2" color="text.secondary">
                  • New incident reported on Main St.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Incident verified by 3 users
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Construction zone updated
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Analytics report generated
                </Typography>
              </Box>
            </Paper>

            {/* Quick Actions */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button variant="outlined" fullWidth startIcon={<Add />}>
                  Report Incident
                </Button>
                <Button variant="outlined" fullWidth startIcon={<Timeline />}>
                  View Analytics
                </Button>
                <Button variant="outlined" fullWidth startIcon={<Map />}>
                  Browse Map
                </Button>
              </Box>
            </Paper>

            {/* System Status */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">Real-time Updates</Typography>
                  <Chip
                    size="small"
                    label={isConnected ? 'Active' : 'Offline'}
                    color={isConnected ? 'success' : 'error'}
                  />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">Map Services</Typography>
                  <Chip size="small" label="Online" color="success" />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">GIS Analysis</Typography>
                  <Chip size="small" label="Ready" color="success" />
                </Box>
              </Box>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default DashboardPage;
