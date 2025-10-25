# 🧪 API Testing Guide

## 📋 Available API Keys

Use any of these keys for testing:

```bash
# Vendor 1
cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567

# Vendor 2  
cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543

# Internal Team
cp_live_internal_team_key_2024_secure_123456789abcdef

# Demo Client
cp_live_demo_client_key_2024_secure_987654321fedcba
```

## 🚀 Local Testing

### Health Check
```bash
curl -X GET http://localhost:8000/api/health
```

### Get Available Slots (Local)
```bash
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST", 
    "email": "ali+test@mm.ventures",
    "phone": "5127673628"
  }'
```

### Test with Different Contact Info
```bash
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com", 
    "phone": "5551234567"
  }'
```

## 🌐 Production Testing (Vercel)

Your production URL: **https://chili-piper-scraper-jysh.vercel.app/**

### Health Check
```bash
curl -X GET https://chili-piper-scraper-jysh.vercel.app/api/health
```

### Get Available Slots (Production)
```bash
curl -X POST https://chili-piper-scraper-jysh.vercel.app/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST",
    "email": "ali+test@mm.ventures", 
    "phone": "5127673628"
  }'
```

### Test with Different Tokens
```bash
# Vendor 2
curl -X POST https://chili-piper-scraper-jysh.vercel.app/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'

# Internal Team
curl -X POST https://chili-piper-scraper-jysh.vercel.app/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_internal_team_key_2024_secure_123456789abcdef" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane.smith@company.com",
    "phone": "5559876543"
  }'
```

## 🔐 Authentication Testing

### Valid Token Test
```bash
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_internal_team_key_2024_secure_123456789abcdef" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com",
    "phone": "5551234567"
  }'
```

### Invalid Token Test
```bash
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid_token" \
  -d '{
    "first_name": "Test",
    "last_name": "User", 
    "email": "test@example.com",
    "phone": "5551234567"
  }'
```

### Missing Token Test
```bash
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com", 
    "phone": "5551234567"
  }'
```

## 📊 Expected Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "total_slots": 127,
    "total_days": 5,
    "note": "Found 5 days with 127 total booking slots",
    "slots": [
      {
        "date": "2025-10-28",
        "time": "8:00 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "2025-10-28", 
        "time": "8:35 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ]
  }
}
```

### Error Response (Invalid Token)
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "Please provide a valid API key in the Authorization header",
  "usage": {
    "header": "Authorization: Bearer <your-api-key>",
    "contact": "Contact administrator for API key"
  }
}
```

## 🛠️ Testing Scripts

### Quick Test Script
```bash
#!/bin/bash
echo "Testing Chili Piper API..."

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s http://localhost:8000/api/health | jq .

# Test with valid token
echo "2. Testing with valid token..."
curl -s -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST",
    "email": "ali+test@mm.ventures",
    "phone": "5127673628"
  }' | jq .

# Test with invalid token
echo "3. Testing with invalid token..."
curl -s -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid_token" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com",
    "phone": "5551234567"
  }' | jq .
```

## 📝 Notes

- **Response Time**: Expect 5-10 seconds for slot scraping
- **Rate Limiting**: No rate limiting (manual key management)
- **Token Expiry**: Tokens expire after 30 days (except demo_client: 3 months)
- **Error Handling**: All errors return proper HTTP status codes
- **CORS**: Enabled for all origins in production

## 🔧 Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check your API token
2. **500 Internal Server Error**: Check server logs
3. **Timeout**: The scraping process can take time
4. **0 slots returned**: Normal if no available booking days
5. **404 Not Found (Production)**: Vercel deployment issue

### Vercel Deployment Issues

If you're getting 404 errors on production:

1. **Check Vercel Build Logs**:
   - Go to your Vercel dashboard
   - Check the latest deployment logs
   - Look for Python/Playwright installation errors

2. **Verify vercel.json Configuration**:
   ```json
   {
     "version": 2,
     "buildCommand": "./build.sh",
     "builds": [
       {
         "src": "api/**/*.py",
         "use": "@vercel/python",
         "config": {
           "maxLambdaSize": "50mb"
         }
       },
       {
         "src": "pages/**/*.html",
         "use": "@vercel/static"
       }
     ],
     "routes": [
       {
         "src": "/api/(.*)",
         "dest": "/api/$1"
       },
       {
         "src": "/(.*)",
         "dest": "/pages/$1"
       }
     ]
   }
   ```

3. **Redeploy**:
   ```bash
   # Push changes to trigger redeploy
   git push origin main
   
   # Or redeploy manually in Vercel dashboard
   ```

4. **Check Function Logs**:
   - In Vercel dashboard, go to Functions tab
   - Check logs for any Python errors
   - Look for Playwright installation issues

### Debug Commands

```bash
# Check if server is running (local)
curl -I http://localhost:8000/api/health

# Test with verbose output (local)
curl -v -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"first_name": "Test", "last_name": "User", "email": "test@example.com", "phone": "5551234567"}'

# Test production with verbose output
curl -v -X POST https://chili-piper-scraper-jysh.vercel.app/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567" \
  -d '{"first_name": "Test", "last_name": "User", "email": "test@example.com", "phone": "5551234567"}'
```
