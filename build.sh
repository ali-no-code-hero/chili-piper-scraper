#!/bin/bash

# Build script for Vercel deployment
echo "Building Chili Piper Scraper for Vercel..."

# Install Playwright browsers
npx playwright install chromium

echo "Build completed!"
