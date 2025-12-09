#!/bin/bash

# Test API with timing information
# Usage: ./test-api-timing.sh

API_URL="https://chili-piper-scraper-production.up.railway.app/api/get-slots"
API_KEY="Y1h0RjJzS2pBaDhyT2dUY1d6Wm1kU2pQZHR3eTJqQm0"

echo "🚀 Testing API with timing..."
echo ""

# Test with detailed timing breakdown
curl -w "\n\n═══════════════════════════════════════\n" \
     -w "Timing Breakdown:\n" \
     -w "  DNS Lookup:        %{time_namelookup}s\n" \
     -w "  Connect:           %{time_connect}s\n" \
     -w "  SSL Handshake:     %{time_appconnect}s\n" \
     -w "  Time to First Byte: %{time_starttransfer}s\n" \
     -w "  Total Time:        %{time_total}s\n" \
     -w "═══════════════════════════════════════\n" \
     -X POST "$API_URL" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $API_KEY" \
     -d '{
       "first_name": "Test",
       "last_name": "User",
       "email": "test@example.com",
       "phone": "5551234567",
       "days": 3
     }' \
     -s | jq '.'

echo ""
echo "✅ Test complete!"

