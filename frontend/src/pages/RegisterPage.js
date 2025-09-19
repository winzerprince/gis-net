/**
 * ===================================================
 * REGISTRATION PAGE COMPONENT
 * User Account Creation Interface
 * ===================================================
 * 
 * Provides user registration functionality with comprehensive
 * form validation, password confirmation, and terms acceptance.
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
  Grid,
} from '@mui/material';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../context/AuthContext';

// Validation schema
const registrationSchema = Yup.object().shape({
  username: Yup.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be less than 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .required('Username is required'),
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
    .matches(/(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
    .matches(/(?=.*\d)/, 'Password must contain at least one number')
    .matches(/(?=.*[@$!%*?&])/, 'Password must contain at least one special character (@$!%*?&)')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), null], 'Passwords must match')
    .required('Password confirmation is required'),
  firstName: Yup.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .required('First name is required'),
  lastName: Yup.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .required('Last name is required'),
  acceptTerms: Yup.boolean()
    .oneOf([true], 'You must accept the terms and conditions'),
});

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register, error, clearError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    clearError();

    const userData = {
      username: values.username,
      email: values.email,
      password: values.password,
      confirmPassword: values.confirmPassword,
      firstName: values.firstName,
      lastName: values.lastName,
      acceptTerms: values.acceptTerms,
    };

    const success = await register(userData);
    
    if (success) {
      navigate('/dashboard');
    }
    
    setIsSubmitting(false);
  };

  return (
    <Container component="main" maxWidth="md">
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
              Join the Real-Time Traffic Incident Network
            </Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom>
            Create Account
          </Typography>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Registration Form */}
          <Formik
            initialValues={{
              username: '',
              email: '',
              password: '',
              confirmPassword: '',
              firstName: '',
              lastName: '',
              acceptTerms: false,
            }}
            validationSchema={registrationSchema}
            onSubmit={handleSubmit}
          >
            {({ errors, touched, values, handleChange, handleBlur }) => (
              <Form style={{ width: '100%' }}>
                <Grid container spacing={2}>
                  {/* First Name & Last Name */}
                  <Grid item xs={12} sm={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      id="firstName"
                      name="firstName"
                      label="First Name"
                      value={values.firstName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={Boolean(touched.firstName && errors.firstName)}
                      helperText={touched.firstName && errors.firstName}
                      autoComplete="given-name"
                      autoFocus
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      id="lastName"
                      name="lastName"
                      label="Last Name"
                      value={values.lastName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={Boolean(touched.lastName && errors.lastName)}
                      helperText={touched.lastName && errors.lastName}
                      autoComplete="family-name"
                    />
                  </Grid>

                  {/* Username */}
                  <Grid item xs={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      id="username"
                      name="username"
                      label="Username"
                      value={values.username}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={Boolean(touched.username && errors.username)}
                      helperText={touched.username && errors.username}
                      autoComplete="username"
                    />
                  </Grid>

                  {/* Email */}
                  <Grid item xs={12}>
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
                      autoComplete="email"
                    />
                  </Grid>

                  {/* Password & Confirm Password */}
                  <Grid item xs={12} sm={6}>
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
                      autoComplete="new-password"
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      id="confirmPassword"
                      name="confirmPassword"
                      label="Confirm Password"
                      type="password"
                      value={values.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={Boolean(touched.confirmPassword && errors.confirmPassword)}
                      helperText={touched.confirmPassword && errors.confirmPassword}
                      autoComplete="new-password"
                    />
                  </Grid>

                  {/* Terms and Conditions */}
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Field
                          as={Checkbox}
                          name="acceptTerms"
                          checked={values.acceptTerms}
                          onChange={handleChange}
                          color="primary"
                        />
                      }
                      label={
                        <Typography variant="body2">
                          I accept the{' '}
                          <Link to="/terms" style={{ color: 'inherit' }}>
                            Terms of Service
                          </Link>{' '}
                          and{' '}
                          <Link to="/privacy" style={{ color: 'inherit' }}>
                            Privacy Policy
                          </Link>
                        </Typography>
                      }
                    />
                    {touched.acceptTerms && errors.acceptTerms && (
                      <Typography variant="caption" color="error" display="block">
                        {errors.acceptTerms}
                      </Typography>
                    )}
                  </Grid>
                </Grid>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                  sx={{ mt: 3, mb: 2, py: 1.5 }}
                >
                  {isSubmitting ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>

                <Divider sx={{ my: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    OR
                  </Typography>
                </Divider>

                <Box textAlign="center">
                  <Typography variant="body2" color="text.secondary">
                    Already have an account?{' '}
                    <Link 
                      to="/login" 
                      style={{ 
                        color: 'inherit', 
                        textDecoration: 'none',
                        fontWeight: 'bold'
                      }}
                    >
                      Sign in here
                    </Link>
                  </Typography>
                </Box>
              </Form>
            )}
          </Formik>
        </Paper>
      </Box>
    </Container>
  );
};

export default RegisterPage;
