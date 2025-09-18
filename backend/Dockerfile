# ==================================================
# GIS-NET BACKEND DOCKERFILE
# Enhanced Real-Time Traffic Incident Reporting System
# ==================================================
#
# Multi-stage Dockerfile for Node.js backend API server
# Supports both development (with hot reload) and production builds
# Optimized for security, performance, and minimal image size
#
# USAGE:
# Development: docker build --target development -t gis-net-backend-dev .
# Production:  docker build --target production -t gis-net-backend-prod .

# ==================================================
# BASE IMAGE - Node.js LTS Alpine
# Alpine Linux for minimal size and security
# ==================================================
FROM node:18-alpine AS base

# Install system dependencies required for native modules
# - python3, make, g++ for native compilation (bcrypt, etc.)
# - curl for health checks
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

# Create application directory with proper permissions
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

# Install ALL dependencies (including dev dependencies)
RUN npm ci --only=production=false && \
    npm cache clean --force

# ==================================================
# DEVELOPMENT STAGE
# Hot reload, debugging tools, development dependencies
# ==================================================
FROM base AS development

# Set development environment
ENV NODE_ENV=development
ENV DEBUG=gis-net:*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 4000

# Development command (will be overridden by docker-compose)
CMD ["npm", "run", "dev"]

# ==================================================
# BUILD STAGE
# Prepare production build (if needed for additional processing)
# ==================================================
FROM deps AS build

# Copy source code
COPY . .

# Run any build processes (linting, tests, etc.)
RUN npm run lint && \
    npm run test:ci

# Remove development dependencies
RUN npm prune --production

# ==================================================
# PRODUCTION STAGE
# Minimal production image with only runtime dependencies
# ==================================================
FROM base AS production

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

# Copy only production dependencies
COPY --from=build /app/node_modules ./node_modules

# Copy application source (excluding dev files via .dockerignore)
COPY . .

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Change to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/api/health || exit 1

# Production command
CMD ["node", "src/server.js"]
