#!/bin/bash

# ===================================================
# GIS-NET Backend Verification & Startup Script
# Ensures backend is running and API is accessible
# ===================================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[VERIFY]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo "🔍 Checking backend status..."

# Check if backend is running
if ! lsof -i :4000 >/dev/null 2>&1; then
  error "Backend is NOT running! Starting backend..."
  
  # Kill any stuck processes first
  pkill -f "nodemon.*server.js" 2>/dev/null || true
  pkill -f "node.*server.js" 2>/dev/null || true
  
  cd backend
  echo "Starting backend in background..."
  nohup npm run dev > ../logs/backend-startup.log 2>&1 & 
  BACKEND_PID=$!
  
  # Wait for backend to start
  echo "Waiting for backend to initialize..."
  for i in {1..30}; do
    sleep 1
    if lsof -i :4000 >/dev/null 2>&1; then
      log "Backend started successfully (PID: $BACKEND_PID)"
      break
    fi
    echo -n "."
  done
  echo
else
  log "Backend is running on port 4000"
fi

# Test the backend API directly
echo "🔍 Testing backend API directly..."
sleep 2  # Give backend a moment to fully initialize

# Test health endpoint
response=$(curl -s -o /dev/null -w "%{http_code}" -m 5 --connect-timeout 2 http://localhost:4000/api/health 2>/dev/null || echo "000")

if [ "$response" = "200" ]; then
  log "Backend API is responding properly (HTTP $response)"
else
  error "Backend API returned status: $response"
  echo "This suggests the API is running but might have an issue."
  
  # Show backend logs
  echo "Recent backend logs:"
  if [ -f "../logs/backend-startup.log" ]; then
    tail -10 ../logs/backend-startup.log
  fi
fi

# Test API info endpoint
info "Testing API info endpoint..."
api_response=$(curl -s -m 5 http://localhost:4000/api 2>/dev/null || echo "Failed to connect")
if [[ "$api_response" == *"GIS-NET Backend API"* ]]; then
  log "API info endpoint is working"
else
  warn "API info endpoint may have issues"
fi

# Test CORS for frontend origin
info "Testing CORS configuration..."
cors_test=$(curl -s -I -H "Origin: http://localhost:3000" http://localhost:4000/api/health 2>/dev/null | grep -i "access-control-allow-origin" || echo "No CORS header found")
if [[ "$cors_test" == *"localhost:3000"* ]] || [[ "$cors_test" == *"*"* ]]; then
  log "CORS is properly configured for frontend"
else
  warn "CORS may not be configured for frontend origin"
  echo "CORS test result: $cors_test"
fi

echo ""
echo "✅ Backend verification completed"
echo "Backend should now be accessible at: http://localhost:4000"
