# Deploy Chili Piper Scraper on Digital Ocean Droplet

Digital Ocean droplets provide full control over the environment, making them perfect for Playwright browser automation.

## 🚀 Quick Deploy Steps

### 1. Create Digital Ocean Droplet

**Recommended Configuration:**
- **Size**: Basic Droplet - $12/month (2GB RAM, 1 CPU, 50GB SSD)
- **Image**: Ubuntu 22.04 LTS
- **Region**: Choose closest to your users
- **Authentication**: SSH Key (recommended) or Password

### 2. Connect to Your Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### 3. Install Node.js 20

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### 4. Install System Dependencies for Playwright

```bash
# Install required system packages
apt-get update
apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libgconf-2-4 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0

# Install additional dependencies for headless browser
apt-get install -y \
    xvfb \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libgconf-2-4
```

### 5. Clone Your Repository

```bash
# Install git if not already installed
apt-get install -y git

# Clone your repository
git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
cd chili-piper-scraper
```

### 6. Install Project Dependencies

```bash
# Install npm dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps

# Verify Playwright installation
npx playwright --version
```

### 7. Build the Application

```bash
# Build the Next.js application
npm run build
```

### 8. Install PM2 for Process Management

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'chili-piper-scraper',
    script: 'npm',
    args: 'start',
    cwd: '/root/chili-piper-scraper',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Start the application with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 9. Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3000
ufw --force enable
```

### 10. Install and Configure Nginx (Optional but Recommended)

```bash
# Install Nginx
apt-get install -y nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/chili-piper-scraper << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/chili-piper-scraper /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx
```

### 11. Install SSL Certificate (Optional)

```bash
# Install Certbot
apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
certbot --nginx -d your-domain.com

# Auto-renewal
crontab -e
# Add this line:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🧪 Test Your Deployment

```bash
# Test locally on the server
curl -X POST http://localhost:3000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST",
    "email": "ali+test@mm.ventures",
    "phone": "5127673628"
  }'
```

## 📊 Monitor Your Application

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs chili-piper-scraper

# Monitor in real-time
pm2 monit

# Restart application
pm2 restart chili-piper-scraper
```

## 🔧 Troubleshooting

### Playwright Issues

```bash
# Reinstall Playwright browsers
npx playwright install chromium --with-deps

# Check if browser can run
npx playwright test --headed
```

### Memory Issues

```bash
# Check memory usage
free -h
htop

# Restart if needed
pm2 restart chili-piper-scraper
```

### Port Issues

```bash
# Check what's running on port 3000
netstat -tlnp | grep :3000

# Kill process if needed
kill -9 PID_NUMBER
```

## 💰 Digital Ocean Pricing

**Basic Droplet:**
- $12/month (2GB RAM, 1 CPU, 50GB SSD)
- Perfect for this application
- Includes 1TB transfer

**Standard Droplet:**
- $24/month (4GB RAM, 2 CPU, 80GB SSD)
- Better for higher traffic

## ✅ Advantages of Digital Ocean

- ✅ Full control over environment
- ✅ Reliable Playwright support
- ✅ Predictable pricing
- ✅ Easy scaling
- ✅ Custom domains
- ✅ SSH access for debugging
- ✅ No serverless limitations

## 🚀 Deployment Script

Create this script for easy deployment:

```bash
#!/bin/bash
# deploy.sh

echo "🚀 Deploying Chili Piper Scraper to Digital Ocean..."

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps

# Build application
npm run build

# Restart PM2
pm2 restart chili-piper-scraper

echo "✅ Deployment complete!"
```

Make it executable:
```bash
chmod +x deploy.sh
```

## 📝 Next Steps

1. Create Digital Ocean droplet
2. Follow setup steps above
3. Test the API endpoints
4. Configure your domain (optional)
5. Set up monitoring
6. Share the API URL with your team

## 🎯 Expected Performance

- **Response Time**: ~9.5 seconds (same as local)
- **Reliability**: High (dedicated server)
- **Scalability**: Easy to upgrade droplet size
- **Cost**: $12/month for basic setup

Your optimized scraper will work perfectly on Digital Ocean! 🎉
