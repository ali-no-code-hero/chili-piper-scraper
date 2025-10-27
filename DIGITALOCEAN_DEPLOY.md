# Deploy Chili Piper Scraper on DigitalOcean

This guide helps you deploy the Next.js Chili Piper Scraper on a DigitalOcean Droplet.

## 🚀 Option 1: One-Click Deployment (Recommended)

### Step 1: Create DigitalOcean Droplet

1. Go to https://digitalocean.com and sign up
2. Click "Create" → "Droplets"
3. Choose:
   - **Ubuntu 22.04** (or latest)
   - **Size**: $12/month plan (2GB RAM) - minimum recommended
   - **Region**: Choose closest to you
   - **Authentication**: SSH Key (recommended) or Password
4. Click "Create Droplet"

### Step 2: Connect to Your Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### Step 3: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Clone your repository
git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
cd chili-piper-scraper

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium --with-deps

# Build the application
npm run build
```

### Step 4: Start the Application

```bash
# Start with PM2
pm2 start npm --name "chili-piper-scraper" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Step 5: Configure Firewall

```bash
# Allow HTTP (port 3000)
ufw allow 3000
ufw enable
```

### Step 6: Configure Nginx (Optional but Recommended)

Install Nginx:
```bash
apt install nginx -y
```

Create Nginx config:
```bash
nano /etc/nginx/sites-available/chili-piper-scraper
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name YOUR_DROPLET_IP;  # Replace with your domain or IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/chili-piper-scraper /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 7: Setup SSL (Optional)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
certbot --nginx -d your-domain.com
```

## 🚀 Option 2: One-Click App (Even Easier!)

DigitalOcean also offers a Node.js one-click app:

1. Create Droplet → Choose **"One-click Apps"** tab
2. Select **"Node.js"**
3. Choose size ($12/month minimum)
4. Create Droplet
5. SSH into it and follow from Step 3 above

## 📊 Monitoring & Management

### PM2 Commands

```bash
# View running processes
pm2 list

# View logs
pm2 logs chili-piper-scraper

# Restart app
pm2 restart chili-piper-scraper

# Stop app
pm2 stop chili-piper-scraper
```

### Access Your API

Once deployed:
- API endpoint: `http://YOUR_DROPLET_IP/api/get-slots`
- Health check: `http://YOUR_DROPLET_IP/api/health`
- Frontend: `http://YOUR_DROPLET_IP`

## 💰 Cost

- **Droplet**: $12/month (2GB RAM, 1 vCPU, 50GB SSD)
- **Bandwidth**: 2TB transfer included

## ✅ Advantages

- ✅ Full Playwright support
- ✅ No serverless size limits
- ✅ Persistent storage
- ✅ Full control over environment
- ✅ Can run background tasks
- ✅ No cold starts

## 🔄 Auto-Deploy from GitHub

To auto-deploy when you push to GitHub:

1. Install GitHub Actions runner or use a simple webhook
2. Or use a CI/CD service like GitHub Actions to SSH into your droplet

## 🐛 Troubleshooting

If you encounter issues:

```bash
# Check Node.js version
node -v

# Check PM2 status
pm2 logs chili-piper-scraper

# Check Nginx status
systemctl status nginx

# Check firewall
ufw status
```

## 📝 Next Steps

After deployment, test your API:
```bash
curl -X POST http://YOUR_DROPLET_IP/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST",
    "email": "ali+test@mm.ventures",
    "phone": "5127673628"
  }'
```

