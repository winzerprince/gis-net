/**
 * ===================================================
 * PROFILE PAGE COMPONENT
 * User Profile Management Interface
 * ===================================================
 * 
 * User profile settings, preferences, and account management.
 */

import React from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Avatar,
  Chip,
  Button,
} from '@mui/material';
import { Person, Settings, Security } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const ProfilePage = () => {
  const { user } = useAuth();

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box mb={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          User Profile
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage your account settings, preferences, and security options.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Avatar
              sx={{ 
                width: 80, 
                height: 80, 
                bgcolor: 'primary.main',
                mx: 'auto',
                mb: 2,
                fontSize: '2rem'
              }}
            >
              {user?.username?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
            <Typography variant="h6" gutterBottom>
              {user?.username || 'Username'}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {user?.email || 'email@example.com'}
            </Typography>
            <Chip 
              label={user?.role || 'user'} 
              color="primary" 
              size="small" 
              sx={{ mb: 2 }}
            />
            <Box>
              <Button variant="outlined" fullWidth>
                Change Avatar
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Box display="flex" flexDirection="column" gap={3}>
            <Paper sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Person color="primary" />
                <Typography variant="h6">Personal Information</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Update your personal details and contact information.
              </Typography>
              <Button variant="outlined" disabled>
                Edit Profile
              </Button>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Settings color="primary" />
                <Typography variant="h6">Preferences</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Configure notification settings, map preferences, and application behavior.
              </Typography>
              <Button variant="outlined" disabled>
                Manage Preferences
              </Button>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Security color="primary" />
                <Typography variant="h6">Security Settings</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Change password, manage two-factor authentication, and review login activity.
              </Typography>
              <Button variant="outlined" disabled>
                Security Options
              </Button>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default ProfilePage;
