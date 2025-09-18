# ==================================================
# GIS-NET FRONTEND DOCKERFILE
# Enhanced Real-Time Traffic Incident Reporting System
# ==================================================
#
# Multi-stage Dockerfile for React frontend application
# Supports both development (with hot reload) and production builds
# Production stage uses Nginx for serving static files efficiently
#
# USAGE:
# Development: docker build --target development -t gis-net-frontend-dev .
# Production:  docker build --target production -t gis-net-frontend-prod .

# ==================================================
# BASE IMAGE - Node.js LTS Alpine
# Alpine Linux for minimal size and security
# ==================================================
FROM node:18-alpine AS base

# Install git for some npm packages that might need it
RUN apk add --no-cache git

# Create application directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# ==================================================
# DEPENDENCIES STAGE
# Install and cache dependencies separately for better layer caching
# ==================================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install ALL dependencies
RUN npm ci && \
    npm cache clean --force

# ==================================================
# DEVELOPMENT STAGE
# Hot reload, debugging tools, full development experience
# ==================================================
FROM base AS development

# Set development environment
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Development command
CMD ["npm", "start"]

# ==================================================
# BUILD STAGE
# Create optimized production build
# ==================================================
FROM deps AS build

# Set build environment
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false
ENV REACT_APP_API_URL=/api
ENV REACT_APP_SOCKET_URL=""

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ==================================================
# PRODUCTION STAGE - NGINX
# Serve built React app with Nginx
# ==================================================
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/

# Copy built React application
COPY --from=build /app/build /usr/share/nginx/html

# Copy startup script for environment variable injection
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create non-root user for Nginx
RUN addgroup -g 1001 -S nginx-user && \
    adduser -S nginx-user -u 1001 -G nginx-user

# Change ownership of necessary directories
RUN chown -R nginx-user:nginx-user /usr/share/nginx/html && \
    chown -R nginx-user:nginx-user /var/cache/nginx && \
    chown -R nginx-user:nginx-user /var/log/nginx && \
    chown -R nginx-user:nginx-user /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx-user:nginx-user /var/run/nginx.pid

# Switch to non-root user
USER nginx-user

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start Nginx
CMD ["/docker-entrypoint.sh"]
