#!/bin/bash

# ========================================
# REGISTRATION TEST WITH NEW USER
# Test with completely fresh user data
# ========================================

echo "🧪 Testing Registration with Fresh User"
echo "====================================="

# Test with completely new user data
TEST_DATA='{
  "username": "newuser456",
  "email": "newuser@demo.com",
  "password": "SecurePass789!",
  "confirmPassword": "SecurePass789!",
  "firstName": "Jane",
  "lastName": "Smith",
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
else
    echo "❌ Registration failed"
    echo ""
    echo "🔍 Let's also check what users exist in the database:"
    
    # Check existing users
    PGPASSWORD=password psql -h localhost -U postgres -d trafficdb -c "SELECT username, email FROM users LIMIT 5;"
fi

echo ""
echo "🏁 Test completed"
