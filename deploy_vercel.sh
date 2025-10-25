#!/bin/bash

# Deploy Chili Piper Scraper to Vercel

echo "🚀 Deploying Chili Piper Scraper to Vercel..."
echo "=============================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "🔐 Please log in to Vercel..."
    vercel login
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo ""
echo "🔗 Your app should be available at the URL shown above"
echo "🧪 Test it with: python test_vercel.py <your-app-url>"
