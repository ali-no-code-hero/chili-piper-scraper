#!/bin/bash

# Update script for Chili Piper Scraper on Digital Ocean
# Run this script to update your application

echo "🔄 Updating Chili Piper Scraper..."

# Navigate to project directory
cd /root/chili-piper-scraper

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# Install any new dependencies
echo "📦 Installing dependencies..."
npm install

# Reinstall Playwright browsers (in case of updates)
echo "📦 Updating Playwright browsers..."
npx playwright install chromium --with-deps

# Build the application
echo "📦 Building application..."
npm run build

# Restart PM2 application
echo "🔄 Restarting application..."
pm2 restart chili-piper-scraper

# Show status
echo "📊 Application status:"
pm2 status

echo "✅ Update complete!"
echo ""
echo "🧪 Test your API:"
echo "curl -X POST http://localhost:3000/api/health"

