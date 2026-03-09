#!/bin/bash
# Local test for Schedule Hero get-schedulehero-slots API.
# Requires: server running (npm run dev), DEFAULT_API_KEY or API_KEY in env (e.g. test-key-123).
API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test-key-123}"

echo "📅 Testing Schedule Hero get-schedulehero-slots API"
echo "   API_URL=$API_URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/get-schedulehero-slots" \
  -H "Authorization: Bearer $API_KEY")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

echo "HTTP status: $HTTP_CODE"
echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  SUCCESS=$(echo "$HTTP_BODY" | grep -o '"success":true' || echo "")
  if [ -n "$SUCCESS" ]; then
    echo "✅ get-schedulehero-slots returned success."
    exit 0
  fi
fi

echo "❌ get-schedulehero-slots failed or returned error. Check server logs for [ScheduleHero] messages."
exit 1
