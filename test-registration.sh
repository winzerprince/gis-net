#!/bin/bash

# ========================================
# REGISTRATION FUNCTIONALITY TEST
# Test registration with proper data
# ========================================

echo "🧪 Testing Registration Functionality"
echo "===================================="

# Test data that matches frontend validation
TEST_DATA='{
  "username": "testuser123",
  "email": "test@example.com",
  "password": "TestPass123!",
  "confirmPassword": "TestPass123!",
  "firstName": "John",
  "lastName": "Doe",
  "acceptTerms": true
}'

echo "📤 Sending registration request..."
echo "Data: $TEST_DATA"
echo ""

# Make registration request
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$TEST_DATA" \
  http://localhost:4000/api/auth/register 2>&1)

# Extract HTTP status
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "📨 Response received:"
echo "Status: $HTTP_STATUS"
echo "Body: $BODY"
echo ""

if [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Registration successful!"
    
    # Test login with the same user
    echo ""
    echo "🔐 Testing login with new user..."
    
    LOGIN_DATA='{
      "email": "test@example.com",
      "password": "TestPass123!"
    }'
    
    LOGIN_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "$LOGIN_DATA" \
      http://localhost:4000/api/auth/login 2>&1)
    
    LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
    LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '/HTTP_STATUS:/d')
    
    echo "Login Status: $LOGIN_STATUS"
    echo "Login Response: $LOGIN_BODY"
    
    if [ "$LOGIN_STATUS" = "200" ]; then
        echo "✅ Login successful! Registration flow is working correctly."
    else
        echo "❌ Login failed after registration"
    fi
else
    echo "❌ Registration failed"
    echo "This might be due to:"
    echo "  - User already exists"
    echo "  - Validation error"
    echo "  - Database connection issue"
fi

echo ""
echo "🏁 Test completed"
