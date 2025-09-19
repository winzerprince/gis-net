#!/bin/bash

# ===================================================
# GIS-NET Registration Debug Script
# Real-time monitoring and validation of user registration
# ===================================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[DEBUG]${NC} $1"
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
    echo -e "${PURPLE}[STEP]${NC} $1"
}

echo "🔧 GIS-NET Registration Debug Tool"
echo "================================="

# First ensure backend is running
step "1. Checking backend status..."
if ! lsof -i :4000 >/dev/null 2>&1; then
  error "Backend is NOT running!"
  echo "Please run: ./verify-backend.sh first"
  exit 1
else
  log "Backend is running on port 4000"
fi

# Test database connection via backend
step "2. Testing database connectivity..."
db_test=$(curl -s -m 5 http://localhost:4000/api/health 2>/dev/null || echo "Failed")
if [[ "$db_test" == *"healthy"* ]] || [[ "$db_test" == *"OK"* ]]; then
  log "Database connection appears healthy"
else
  warn "Database connection may have issues"
  echo "Response: $db_test"
fi

# Test registration endpoint
step "3. Testing registration endpoint availability..."
reg_endpoint=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/api/auth/register 2>/dev/null || echo "000")
if [ "$reg_endpoint" = "400" ] || [ "$reg_endpoint" = "422" ]; then
  log "Registration endpoint is available (returned $reg_endpoint as expected for missing data)"
elif [ "$reg_endpoint" = "404" ]; then
  error "Registration endpoint not found! Check backend routes."
else
  info "Registration endpoint returned: $reg_endpoint"
fi

# Test with sample registration data
step "4. Testing registration with sample data..."

# Generate unique test user
timestamp=$(date +%s)
test_user="testuser${timestamp}"
test_email="test${timestamp}@example.com"

echo "Testing with:"
echo "  Username: $test_user"
echo "  Email: $test_email"
echo "  Password: TestPass123@"

registration_response=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$test_user\",
    \"email\": \"$test_email\",
    \"password\": \"TestPass123@\",
    \"confirmPassword\": \"TestPass123@\"
  }" 2>/dev/null || echo "Connection failed")

echo ""
echo "Registration API Response:"
echo "=========================="
echo "$registration_response" | python3 -m json.tool 2>/dev/null || echo "$registration_response"
echo ""

# Parse response
if [[ "$registration_response" == *"token"* ]]; then
  log "✅ Registration SUCCESS! User created successfully."
elif [[ "$registration_response" == *"validation"* ]]; then
  warn "❌ Validation failed. Check password requirements:"
  echo "$registration_response" | grep -o '"message":"[^"]*"' || echo "No specific validation message found"
elif [[ "$registration_response" == *"already exists"* ]]; then
  warn "❌ User already exists (this is expected for repeated tests)"
elif [[ "$registration_response" == *"error"* ]]; then
  error "❌ Registration error occurred"
else
  warn "❌ Unexpected response format"
fi

# Test login with the same credentials
if [[ "$registration_response" == *"token"* ]]; then
  step "5. Testing login with created user..."
  
  login_response=$(curl -s -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$test_email\",
      \"password\": \"TestPass123@\"
    }" 2>/dev/null || echo "Connection failed")
  
  echo "Login API Response:"
  echo "==================="
  echo "$login_response" | python3 -m json.tool 2>/dev/null || echo "$login_response"
  
  if [[ "$login_response" == *"token"* ]]; then
    log "✅ Login SUCCESS! Authentication working properly."
  else
    error "❌ Login failed even though registration succeeded"
  fi
else
  warn "Skipping login test due to registration failure"
fi

echo ""
echo "🔍 Debug Summary:"
echo "================"
echo "1. Backend Status: ✅ Running"
echo "2. Database: $([ "$db_test" != "Failed" ] && echo "✅ Connected" || echo "❌ Issues")"
echo "3. Registration Endpoint: $([ "$reg_endpoint" != "000" ] && echo "✅ Available" || echo "❌ Unavailable")"
echo "4. Registration Test: $([ "$registration_response" == *"token"* ] && echo "✅ Success" || echo "❌ Failed")"
echo ""
echo "If registration is still failing:"
echo "- Check backend logs: tail -f backend/logs/app.log"
echo "- Check frontend console for CORS errors"
echo "- Verify password meets requirements (8+ chars, special chars)"
echo "- Ensure frontend is sending confirmPassword field"
