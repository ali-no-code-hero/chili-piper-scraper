# Chili Piper Slot Scraper

A production-ready web scraping service that automatically extracts available meeting slots from Chili Piper forms. Built with Next.js, TypeScript, and Playwright for reliable browser automation.

## 🚀 Features

- **Automated Slot Scraping**: Extract available meeting slots from Chili Piper forms
- **Dual API Modes**: Regular API for complete results, Streaming API for real-time updates
- **Configurable Targets**: Support for different Chili Piper form URLs
- **API Key Management**: Secure authentication with usage tracking
- **Production Ready**: Optimized for deployment on dedicated servers
- **High Performance**: Sub-10 second response times with streaming support

## 📋 Requirements

- Node.js 20.9.0 or higher
- Linux/Unix environment (for Playwright)
- 2GB+ RAM recommended
- Internet connectivity for scraping

## 🛠️ Installation

### 1. Clone Repository
```bash
git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
cd chili-piper-scraper
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Install Playwright Browser
```bash
npx playwright install chromium --with-deps
```

### 4. Environment Configuration
```bash
cp env.example .env
```

Edit `.env` file with your configuration:
```env
# Target Chili Piper Form URL (configurable)
CHILI_PIPER_FORM_URL=https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice

# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration (for API key management)
DATABASE_URL=sqlite:./data/api_keys.db

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
API_KEY_PREFIX=cp_live

# Scraping Configuration
MAX_SCRAPING_TIMEOUT=30000
MAX_DAYS_TO_COLLECT=7
```

## 🚀 Deployment

### Digital Ocean (Recommended)

For complete deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

**Quick Start**:
```bash
# Create Digital Ocean droplet (Ubuntu 22.04, 2GB RAM minimum)
# Connect via SSH
ssh root@YOUR_DROPLET_IP

# Run automated deployment
wget -O deploy-digitalocean.sh https://raw.githubusercontent.com/ali-no-code-hero/chili-piper-scraper/main/deploy-digitalocean.sh
chmod +x deploy-digitalocean.sh
./deploy-digitalocean.sh
```

### Manual Deployment

1. **Build Application**:
```bash
npm run build
```

2. **Start Production Server**:
```bash
npm start
```

3. **Process Management** (recommended):
```bash
npm install -g pm2
pm2 start npm --name "chili-piper-scraper" -- start
pm2 save
pm2 startup
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHILI_PIPER_FORM_URL` | Target Chili Piper form URL | Required |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | SQLite database path | `sqlite:./data/api_keys.db` |
| `JWT_SECRET` | JWT signing secret | Required |
| `API_KEY_PREFIX` | API key prefix | `cp_live` |
| `MAX_SCRAPING_TIMEOUT` | Scraping timeout (ms) | `30000` |
| `MAX_DAYS_TO_COLLECT` | Max days to scrape | `7` |

### API Key Management

**⚠️ IMPORTANT: Change default admin credentials before deployment!**

1. **Generate Secure Password Hash**:
```bash
node scripts/generate-password-hash.js yourSecurePassword123
```

2. **Update Environment Variables**:
```bash
# Edit .env file
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=your_generated_hash_here
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

3. **Access Admin Panel**:
- Navigate to `https://your-domain.com/admin/secure`
- Login with your admin credentials
- Manage API keys through the secure web interface

4. **API Key Management via API** (Advanced):
```bash
# Login to get admin token
curl -X POST https://your-domain.com/api/admin/secure \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "username": "your_admin_username",
    "password": "your_password"
  }'

# Create API Key
curl -X POST https://your-domain.com/api/admin/secure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "action": "create",
    "name": "Client Name",
    "description": "API key for client"
  }'
```

## 📚 API Usage

### Regular API
```bash
curl -X POST https://your-domain.com/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'
```

### Streaming API
```bash
curl -X POST https://your-domain.com/api/get-slots-per-day-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "first_name": "John",
    "last_name": "Doe", 
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'
```

For complete API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

## 🔍 Monitoring

### Health Check
```bash
curl https://your-domain.com/api/health
```

### PM2 Monitoring
```bash
pm2 status
pm2 logs chili-piper-scraper
pm2 monit
```

### Usage Statistics
```bash
curl -X POST https://your-domain.com/api/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action": "stats"}'
```

## 🛡️ Security Features

### Enterprise-Grade Security
- **✅ Multi-Layer Authentication**: Bcrypt-hashed passwords with JWT tokens
- **✅ Rate Limiting**: Configurable limits per endpoint and IP
- **✅ Input Validation**: Comprehensive validation and sanitization
- **✅ Security Headers**: XSS, CSRF, and clickjacking protection
- **✅ API Key Management**: Secure key generation and usage tracking
- **✅ Audit Logging**: Complete security event logging
- **✅ CORS Protection**: Configurable cross-origin resource sharing
- **✅ SQL Injection Prevention**: Prepared statements with SQLite

### Security Middleware
All API endpoints are protected by a comprehensive security middleware that provides:
- **Authentication**: API key validation for all protected endpoints
- **Rate Limiting**: 50 requests/15min (regular API), 30 requests/15min (streaming)
- **Input Validation**: Strict validation of all request data
- **Sanitization**: Automatic removal of potentially dangerous content
- **Security Headers**: Automatic addition of security headers
- **Audit Logging**: Complete logging of all security events

### Admin Panel Security
- **✅ Password Authentication**: Bcrypt-hashed passwords with salt
- **✅ JWT Tokens**: Secure admin tokens with 1-hour expiration
- **✅ Rate Limiting**: 5 login attempts per 15 minutes per IP
- **✅ Session Management**: Automatic logout on token expiration
- **✅ API Key Masking**: Full keys only shown on demand with clipboard copy
- **✅ Input Validation**: Strict validation of all admin inputs

### Production Security Checklist
- [ ] Change default admin username and password
- [ ] Generate secure JWT secret (32+ characters)
- [ ] Use HTTPS in production
- [ ] Configure firewall rules
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Backup database regularly
- [ ] Enable fail2ban for intrusion prevention
- [ ] Configure automatic security updates

## 📊 Performance

- **Regular API**: ~10-15 seconds response time
- **Streaming API**: ~4 seconds for first data, complete in ~10-15 seconds
- **Memory Usage**: ~150MB typical
- **Concurrent Requests**: Supports multiple simultaneous requests

## 🔧 Troubleshooting

### Common Issues

1. **Playwright Browser Not Found**:
```bash
npx playwright install chromium --with-deps
```

2. **Permission Denied**:
```bash
sudo chown -R $USER:$USER /var/www/chili-piper-scraper
```

3. **Port Already in Use**:
```bash
sudo lsof -ti:3000 | xargs kill -9
```

4. **Database Locked**:
```bash
sudo chmod 664 ./data/api_keys.db
```

### Logs
```bash
# Application logs
pm2 logs chili-piper-scraper

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# System logs
sudo journalctl -u nginx -f
```

## 🤝 Support

For technical support or feature requests:
- Create an issue on GitHub
- Contact your system administrator
- Review the API documentation

## 📄 License

ISC License - see LICENSE file for details.

## 🔄 Updates

To update the application:
```bash
git pull origin main
npm install
npm run build
pm2 restart chili-piper-scraper
```

Or use the automated update script:
```bash
./update-digitalocean.sh
```