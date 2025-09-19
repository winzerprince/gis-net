#!/bin/bash

# ===================================================
# GIS-NET Status Monitoring Script
# Comprehensive system health checks with database connectivity
# ===================================================

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[STATUS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

step() {
    echo -e "${PURPLE}[CHECK]${NC} $1"
}

echo "🔍 GIS-NET System Status Check"
echo "=============================="

# Check Docker services
step "Docker Services Status"
if command -v docker-compose >/dev/null 2>&1; then
  if docker-compose ps 2>/dev/null | grep -q "Up"; then
    log "Docker services are running"
    docker-compose ps | grep -E "(Name|State|Ports)" | head -5
  else
    warn "Docker services may not be running"
  fi
else
  info "Docker Compose not found - checking individual services"
fi

echo ""

# Check Database (port 5432)
step "Database Connectivity"
if lsof -i :5432 >/dev/null 2>&1; then
  log "Database is running on port 5432"
  
  # Test database connection via backend health endpoint
  db_health=$(curl -s -m 3 --connect-timeout 2 http://localhost:4000/api/health 2>/dev/null || echo "unreachable")
  if [[ "$db_health" == *"healthy"* ]] || [[ "$db_health" == *"OK"* ]]; then
    log "Database connection verified through backend"
  elif [[ "$db_health" == "unreachable" ]]; then
    warn "Cannot verify database connection (backend not responding)"
  else
    warn "Database connection may have issues"
  fi
else
  error "Database is NOT running on port 5432"
fi

# Check Backend (port 4000) with comprehensive API tests
echo ""
step "Backend Service & API"
if lsof -i :4000 >/dev/null 2>&1; then
  log "Backend is running on port 4000"
  
  # Test API endpoints
  api_response=$(curl -s -o /dev/null -w "%{http_code}" -m 2 --connect-timeout 2 http://localhost:4000/api 2>/dev/null || echo "timeout")
  
  if [ "$api_response" = "200" ]; then
    log "Backend API is responding (HTTP 200)"
    
    # Test authentication endpoints
    auth_response=$(curl -s -o /dev/null -w "%{http_code}" -X POST -m 2 http://localhost:4000/api/auth/register 2>/dev/null || echo "timeout")
    if [ "$auth_response" = "400" ] || [ "$auth_response" = "422" ]; then
      log "Authentication endpoints are available"
    else
      warn "Authentication endpoints may have issues (status: $auth_response)"
    fi
    
  elif [ "$api_response" = "timeout" ]; then
    warn "Backend API is slow to respond"
  else
    warn "Backend API returned status: $api_response"
  fi
else
  error "Backend is NOT running on port 4000"
fi

# Check Frontend (port 3000)  
echo ""
step "Frontend Application"
if lsof -i :3000 >/dev/null 2>&1; then
  log "Frontend is running on port 3000"
  
  # Quick frontend test with timeout
  frontend_response=$(curl -s -o /dev/null -w "%{http_code}" -m 2 --connect-timeout 2 http://localhost:3000 2>/dev/null || echo "timeout")
  
  if [ "$frontend_response" = "200" ]; then
    log "Frontend is responding (HTTP 200)"
  elif [ "$frontend_response" = "timeout" ]; then
    warn "Frontend is slow to respond"  
  else
    warn "Frontend returned status: $frontend_response"
  fi
else
  error "Frontend is NOT running on port 3000"
fi

# Socket.io connectivity check
echo ""
step "Real-time Communication (Socket.io)"
socket_test=$(curl -s -m 2 http://localhost:4000/socket.io/ 2>/dev/null || echo "failed")
if [[ "$socket_test" == *"socket.io"* ]]; then
  log "Socket.io server is accessible"
else
  warn "Socket.io server may not be responding"
fi

# Network connectivity summary
echo ""
echo "🌐 Network Summary:"
echo "==================="
echo "Database (5432): $(lsof -i :5432 >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Down")"
echo "Backend (4000):  $(lsof -i :4000 >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Down")"  
echo "Frontend (3000): $(lsof -i :3000 >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Down")"
echo ""
echo "✅ Status check completed"
echo ""
echo "💡 Quick Actions:"
echo "- Start all services: ./dev-start.sh"
echo "- Debug registration: ./debug-registration.sh" 
echo "- Verify backend: ./verify-backend.sh"
