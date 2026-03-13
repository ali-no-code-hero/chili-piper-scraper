#!/bin/bash

# Local testing script for browser instance persistence and booking API
API_URL="http://localhost:3000"
API_KEY="test-key-123"  # Update this to match your DEFAULT_API_KEY in .env

echo "🧪 Testing Browser Instance Persistence and Booking API"
echo "=================================================="
echo ""

# Test 1: Get slots (creates persistent instance)
echo "📋 Test 1: Get available slots (creates browser instance)..."
echo "--------------------------------------------------"
RESPONSE1=$(curl -s -X POST "$API_URL/api/get-slots" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test.user@example.com",
    "phone": "+15551234567"
  }')

echo "$RESPONSE1" | jq '.' 2>/dev/null || echo "$RESPONSE1"
echo ""

# Check if successful
SUCCESS1=$(echo "$RESPONSE1" | grep -o '"success":true' || echo "")
if [ -z "$SUCCESS1" ]; then
  echo "❌ Get-slots test failed. Check server logs and API key."
  exit 1
fi

echo "✅ Get-slots successful - browser instance should be registered"
echo ""
sleep 2

# Test 2: Book slot with existing instance
echo "📅 Test 2: Book slot (should reuse existing instance)..."
echo "--------------------------------------------------"
RESPONSE2=$(curl -s -X POST "$API_URL/api/book-slot" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "email": "test.user@example.com",
    "dateTime": "November 13, 2025 at 1:25 PM CST",
    "firstName": "Test",
    "lastName": "User",
    "phone": "+15551234567"
  }')

echo "$RESPONSE2" | jq '.' 2>/dev/null || echo "$RESPONSE2"
echo ""

# Check if successful
SUCCESS2=$(echo "$RESPONSE2" | grep -o '"success":true' || echo "")
if [ -z "$SUCCESS2" ]; then
  echo "⚠️  Book-slot test may have failed (this is expected if date/time not available)"
else
  echo "✅ Book-slot successful"
fi

echo ""
sleep 2

# Test 3: Book slot with new instance (on-demand creation)
echo "📅 Test 3: Book slot with new email (creates instance on-demand)..."
echo "--------------------------------------------------"
RESPONSE3=$(curl -s -X POST "$API_URL/api/book-slot" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "email": "new.user@example.com",
    "dateTime": "November 14, 2025 at 2:30 PM CST",
    "firstName": "New",
    "lastName": "User",
    "phone": "+15559876543"
  }')

echo "$RESPONSE3" | jq '.' 2>/dev/null || echo "$RESPONSE3"
echo ""

# Test 4: Get slots again for same email (should reuse instance if within timeout)
echo "📋 Test 4: Get slots again for same email (should reuse instance)..."
echo "--------------------------------------------------"
RESPONSE4=$(curl -s -X POST "$API_URL/api/get-slots" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test.user@example.com",
    "phone": "+15551234567"
  }')

echo "$RESPONSE4" | jq '.' 2>/dev/null || echo "$RESPONSE4"
echo ""

echo "=================================================="
echo "✅ All tests completed!"
echo ""
echo "📝 Check server logs for:"
echo "   - '✅ Browser instance registered for...'"
echo "   - '✅ Using existing instance for...'"
echo "   - '📝 No existing instance for..., creating new one...'"
echo "   - '🧹 Cleaned up X stale browser instance(s)'"

