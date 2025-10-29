#!/bin/bash

# Digital Ocean Deployment Script for Chili Piper Scraper
# Run this script on your Digital Ocean droplet

echo "🚀 Starting Chili Piper Scraper deployment..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install system dependencies for Playwright
echo "📦 Installing Playwright system dependencies..."
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
    libgdk-pixbuf2.0-0 \
    xvfb \
    fonts-liberation \
    libappindicator3-1 \
    libnspr4 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libgconf-2-4

# Install git if not already installed
apt-get install -y git

# Clone repository (if not already cloned)
if [ ! -d "chili-piper-scraper" ]; then
    echo "📦 Cloning repository..."
    git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
fi

cd chili-piper-scraper

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Install Playwright browsers
echo "📦 Installing Playwright browsers..."
npx playwright install chromium --with-deps

# Build the application
echo "📦 Building Next.js application..."
npm run build

# Install PM2 for process management
echo "📦 Installing PM2..."
npm install -g pm2

# Create PM2 ecosystem file
echo "📦 Creating PM2 configuration..."
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
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Configure firewall
echo "🔒 Configuring firewall..."
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3000
ufw --force enable

# Install Nginx
echo "📦 Installing and configuring Nginx..."
apt-get install -y nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/chili-piper-scraper << 'EOF'
server {
    listen 80;
    server_name _;

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
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# Test the API
echo "🧪 Testing API..."
sleep 5
curl -X POST http://localhost:3000/api/health

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Application Status:"
pm2 status
echo ""
echo "🌐 Your API is available at:"
echo "   http://YOUR_DROPLET_IP/api/get-slots"
echo "   http://YOUR_DROPLET_IP/api/get-slots-per-day-stream"
echo ""
echo "📝 Useful commands:"
echo "   pm2 status          - Check application status"
echo "   pm2 logs            - View application logs"
echo "   pm2 restart         - Restart application"
echo "   pm2 monit           - Monitor in real-time"
echo ""
echo "🎉 Your Chili Piper Scraper is now running on Digital Ocean!"

