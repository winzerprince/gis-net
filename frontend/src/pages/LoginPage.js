/**
 * ===================================================
 * LOGIN PAGE COMPONENT
 * User Authentication Interface
 * ===================================================
 * 
 * Provides user login functionality with form validation,
 * error handling, and navigation to registration.
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Divider,
  CircularProgress,
} from '@mui/material';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../context/AuthContext';

// Validation schema
const loginSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  rememberMe: Yup.boolean(),
});

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    clearError();

    const success = await login(values.email, values.password, values.rememberMe);
    
    if (success) {
      navigate('/dashboard');
    }
    
    setIsSubmitting(false);
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Header */}
          <Box textAlign="center" mb={3}>
            <Typography variant="h3" component="h1" fontWeight="bold" color="primary.main" gutterBottom>
              GIS-NET
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Real-Time Traffic Incident Reporting
            </Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom>
            Sign In
          </Typography>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Formik
            initialValues={{
              email: '',
              password: '',
              rememberMe: false,
            }}
            validationSchema={loginSchema}
            onSubmit={handleSubmit}
          >
            {({ errors, touched, values, handleChange, handleBlur }) => (
              <Form style={{ width: '100%' }}>
                <Field
                  as={TextField}
                  fullWidth
                  id="email"
                  name="email"
                  label="Email Address"
                  type="email"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={Boolean(touched.email && errors.email)}
                  helperText={touched.email && errors.email}
                  margin="normal"
                  autoComplete="email"
                  autoFocus
                />

                <Field
                  as={TextField}
                  fullWidth
                  id="password"
                  name="password"
                  label="Password"
                  type="password"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={Boolean(touched.password && errors.password)}
                  helperText={touched.password && errors.password}
                  margin="normal"
                  autoComplete="current-password"
                />

                <FormControlLabel
                  control={
                    <Field
                      as={Checkbox}
                      name="rememberMe"
                      checked={values.rememberMe}
                      onChange={handleChange}
                      color="primary"
                    />
                  }
                  label="Remember me"
                  sx={{ mt: 1, mb: 2 }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                  sx={{ mt: 2, mb: 3, py: 1.5 }}
                >
                  {isSubmitting ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Signing In...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <Divider sx={{ my: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    OR
                  </Typography>
                </Divider>

                <Box textAlign="center">
                  <Typography variant="body2" color="text.secondary">
                    Don't have an account?{' '}
                    <Link 
                      to="/register" 
                      style={{ 
                        color: 'inherit', 
                        textDecoration: 'none',
                        fontWeight: 'bold'
                      }}
                    >
                      Sign up here
                    </Link>
                  </Typography>
                </Box>
              </Form>
            )}
          </Formik>

          {/* Footer */}
          <Box mt={4} textAlign="center">
            <Typography variant="caption" color="text.secondary">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;
