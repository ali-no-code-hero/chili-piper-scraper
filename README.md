# Chili Piper Slot Scraper

A production-ready web scraping service that automatically extracts available meeting slots from Chili Piper forms. Built with Next.js, TypeScript, and Playwright for reliable browser automation.

## 🚀 Quick Start

### Deploy to Digital Ocean App Platform

1. **Connect Repository**:
   - Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
   - Click "Create App"
   - Connect your GitHub repository

2. **Configure Build Settings**:
   - **Build Command**: `npm install && npm run build`
   - **Run Command**: `npm start`
   - **Environment**: Node.js

3. **Set Environment Variables**:
   ```
   CHILI_PIPER_FORM_URL=https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice
   NODE_ENV=production
   PORT=3000
   JWT_SECRET=<generate-with-openssl-rand-hex-32>
   API_KEY_PREFIX=cp_live
   DEFAULT_API_KEY=<your-api-key-here>
   ADMIN_USERNAME=<your-admin-username>
   ADMIN_PASSWORD_HASH=<generate-with-node-scripts-generate-password-hash.js>
   MAX_SCRAPING_TIMEOUT=30000
   MAX_DAYS_TO_COLLECT=7
   ```

4. **Deploy**: Click "Create Resources" and your app will deploy automatically.

## 📋 Requirements

- Node.js 20.9.0 or higher
- Playwright browser dependencies (installed automatically)
- 2GB+ RAM recommended

## 🛠️ Local Development

### Installation

```bash
# Clone repository
git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
cd chili-piper-scraper

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium --with-deps

# Copy environment template
cp env.example .env

# Edit .env with your configuration
nano .env
```

### Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📚 API Usage

### Health Check

```bash
curl http://your-domain.com/api/health
```

### Get Available Slots

```bash
curl -X POST http://your-domain.com/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'
```

### Response Format

```json
{
  "success": true,
  "data": {
    "total_slots": 139,
    "total_days": 5,
    "note": "Found 5 days with 139 total booking slots",
    "slots": [
      {
        "date": "2025-12-08",
        "time": "8:30 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ]
  }
}
```

## 🔐 Security Features

- **API Key Authentication**: All endpoints require valid API keys
- **Rate Limiting**: Configurable rate limits per endpoint
- **Input Validation**: Comprehensive validation and sanitization
- **Security Headers**: XSS, CSRF, and clickjacking protection
- **Environment Variables**: All secrets stored in environment variables (never hardcoded)

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CHILI_PIPER_FORM_URL` | Target Chili Piper form URL | Yes |
| `NODE_ENV` | Environment mode | Yes |
| `PORT` | Server port | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `DEFAULT_API_KEY` | Default API key for authentication | Yes |
| `API_KEYS` | Comma-separated list of additional API keys | No |
| `ADMIN_USERNAME` | Admin panel username | Yes |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | Yes |
| `MAX_SCRAPING_TIMEOUT` | Scraping timeout (ms) | No |
| `MAX_DAYS_TO_COLLECT` | Max days to scrape | No |

### Generate Secrets

**JWT Secret**:
```bash
openssl rand -hex 32
```

**Admin Password Hash**:
```bash
node scripts/generate-password-hash.js yourSecurePassword123
```

## 🛡️ Security Best Practices

1. **Never commit `.env` files** - They are in `.gitignore`
2. **Use strong secrets** - Generate JWT_SECRET and password hashes
3. **Rotate API keys regularly** - Update `DEFAULT_API_KEY` and `API_KEYS`
4. **Keep dependencies updated** - Run `npm audit` regularly
5. **Monitor logs** - Check application logs for suspicious activity

## 📊 API Endpoints

- `GET /api/health` - Health check endpoint
- `POST /api/get-slots` - Get available slots (requires API key)
- `POST /api/get-slots-stream` - Streaming API (requires API key)
- `POST /api/get-slots-per-day-stream` - Per-day streaming (requires API key)
- `POST /api/admin/secure` - Admin operations (requires admin token)

For complete API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

## 🔍 Troubleshooting

### Playwright Browser Issues

```bash
# Reinstall browsers
npx playwright install chromium --with-deps
```

### Memory Issues

- Increase App Platform instance size
- Check `MAX_SCRAPING_TIMEOUT` setting
- Monitor application logs

### API Authentication Errors

- Verify `DEFAULT_API_KEY` is set correctly
- Check API key format: `Authorization: Bearer YOUR_API_KEY`
- Ensure environment variables are set in App Platform

## 📄 License

ISC License

## 🤝 Support

For issues and feature requests, please use [GitHub Issues](https://github.com/ali-no-code-hero/chili-piper-scraper/issues).
