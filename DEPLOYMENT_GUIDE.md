# Digital Ocean Deployment Guide

Complete guide for deploying the Chili Piper Slot Scraper on Digital Ocean droplets with security, monitoring, and maintenance.

## 🚀 Quick Start

### Automated Deployment (Recommended)

1. **Create Digital Ocean Droplet**:
   - **Size**: Basic Droplet - $12/month (2GB RAM, 1 CPU, 50GB SSD)
   - **Image**: Ubuntu 22.04 LTS
   - **Region**: Choose closest to your users
   - **Authentication**: SSH Key (recommended)

2. **Run Automated Setup**:
```bash
# Connect to your droplet
ssh root@YOUR_DROPLET_IP

# Download and run the deployment script
wget -O deploy-digitalocean.sh https://raw.githubusercontent.com/ali-no-code-hero/chili-piper-scraper/main/deploy-digitalocean.sh
chmod +x deploy-digitalocean.sh
./deploy-digitalocean.sh
```

3. **Configure Environment**:
```bash
# Copy environment template
cp env.example .env

# Edit with your settings
nano .env
```

4. **Generate Admin Password**:
```bash
# Generate secure password hash
node scripts/generate-password-hash.js yourSecurePassword123

# Add to .env file
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=your_generated_hash_here
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

5. **Restart Application**:
```bash
pm2 restart chili-piper-scraper
```

## 🔧 Manual Setup (Advanced)

### 1. System Preparation

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install system dependencies for Playwright
apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
    libgtk-3-0 libgbm1 libasound2 libxss1 libgconf-2-4 \
    libxrandr2 libpangocairo-1.0-0 libatk1.0-0 \
    libcairo-gobject2 libgdk-pixbuf2.0-0 xvfb \
    fonts-liberation libappindicator3-1 libnspr4 \
    libx11-xcb1 libxcomposite1 libxdamage1 libgbm1
```

### 2. Application Setup

```bash
# Clone repository
git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
cd chili-piper-scraper

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps

# Build application
npm run build
```

### 3. Process Management with PM2

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

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Web Server Configuration (Nginx)

```bash
# Install Nginx
apt-get install -y nginx

# Create configuration
cat > /etc/nginx/sites-available/chili-piper-scraper << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

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
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/chili-piper-scraper /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test and restart
nginx -t
systemctl restart nginx
systemctl enable nginx
```

### 5. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal
crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 6. Firewall Configuration

```bash
# Configure UFW
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 3000
ufw --force enable

# Check status
ufw status
```

## 🔄 Updates and Maintenance

### Automated Updates

```bash
# Download update script
wget -O update-digitalocean.sh https://raw.githubusercontent.com/ali-no-code-hero/chili-piper-scraper/main/update-digitalocean.sh
chmod +x update-digitalocean.sh

# Run updates
./update-digitalocean.sh
```

### Manual Updates

```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Rebuild application
npm run build

# Restart services
pm2 restart chili-piper-scraper
systemctl reload nginx
```

## 📊 Monitoring and Logs

### Application Monitoring

```bash
# PM2 status
pm2 status

# View logs
pm2 logs chili-piper-scraper

# Real-time monitoring
pm2 monit

# Restart if needed
pm2 restart chili-piper-scraper
```

### System Monitoring

```bash
# System resources
htop
free -h
df -h

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Application logs
tail -f ~/.pm2/logs/chili-piper-scraper-out.log
tail -f ~/.pm2/logs/chili-piper-scraper-error.log
```

### Security Monitoring

```bash
# Check failed login attempts
grep "Failed password" /var/log/auth.log

# Check active connections
netstat -tlnp

# Monitor disk usage
du -sh /var/log/*
```

## 🛡️ Security Hardening

### 1. SSH Security

```bash
# Disable root login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Change SSH port
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

# Restart SSH
systemctl restart sshd
```

### 2. System Updates

```bash
# Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### 3. Fail2Ban

```bash
# Install Fail2Ban
apt install -y fail2ban

# Configure for Nginx
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF

systemctl enable fail2ban
systemctl start fail2ban
```

## 🧪 Testing Deployment

### Health Check

```bash
curl https://your-domain.com/api/health
```

### API Test

```bash
curl -X POST https://your-domain.com/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com",
    "phone": "5551234567"
  }'
```

### Admin Panel Test

```bash
# Access admin panel
curl https://your-domain.com/admin/secure
```

## 🔧 Troubleshooting

### Common Issues

**Playwright Browser Issues**:
```bash
# Reinstall browsers
npx playwright install chromium --with-deps

# Test browser
npx playwright test --headed
```

**Memory Issues**:
```bash
# Check memory usage
free -h
htop

# Restart if needed
pm2 restart chili-piper-scraper
```

**Port Conflicts**:
```bash
# Check port usage
netstat -tlnp | grep :3000

# Kill conflicting process
kill -9 PID_NUMBER
```

**Nginx Issues**:
```bash
# Test configuration
nginx -t

# Check logs
tail -f /var/log/nginx/error.log

# Restart
systemctl restart nginx
```

### Performance Optimization

**Database Optimization**:
```bash
# Check database size
ls -lh data/api_keys.db

# Backup database
cp data/api_keys.db data/api_keys.db.backup
```

**Memory Optimization**:
```bash
# Adjust PM2 memory limit
pm2 restart chili-piper-scraper --max-memory-restart 2G
```

## 💰 Cost Breakdown

**Monthly Costs**:
- **Basic Droplet**: $12/month (2GB RAM, 1 CPU, 50GB SSD)
- **Domain**: $10-15/year (optional)
- **SSL Certificate**: Free (Let's Encrypt)
- **Total**: ~$12-13/month

**Scaling Options**:
- **Standard Droplet**: $24/month (4GB RAM, 2 CPU)
- **General Purpose**: $48/month (8GB RAM, 2 CPU)
- **CPU Optimized**: $84/month (8GB RAM, 4 CPU)

## 📈 Performance Expectations

- **Response Time**: 9-15 seconds (depending on Chili Piper response)
- **Concurrent Users**: 10-20 (with 2GB RAM)
- **Uptime**: 99.9%+ (with proper monitoring)
- **Scalability**: Easy horizontal scaling

## ✅ Deployment Checklist

- [ ] Digital Ocean droplet created
- [ ] SSH access configured
- [ ] Node.js 20 installed
- [ ] Playwright dependencies installed
- [ ] Application cloned and built
- [ ] PM2 configured and running
- [ ] Nginx configured with SSL
- [ ] Firewall configured
- [ ] Environment variables set
- [ ] Admin password generated
- [ ] Health check passing
- [ ] API endpoints tested
- [ ] Monitoring configured
- [ ] Backup strategy implemented

## 🎯 Next Steps

1. **Monitor Performance**: Set up alerts for high CPU/memory usage
2. **Regular Backups**: Implement automated database backups
3. **Security Updates**: Schedule regular system updates
4. **Log Rotation**: Configure log rotation to prevent disk full
5. **Scaling Plan**: Prepare for traffic growth

Your Chili Piper scraper is now production-ready on Digital Ocean! 🎉
