# Railway Deployment Guide

This application is configured to deploy on Railway using Docker with Microsoft's official Playwright image.

## Quick Deploy

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository: `ali-no-code-hero/chili-piper-scraper`
4. Railway will automatically detect the Dockerfile and start building
5. Add environment variables (see below)
6. Your app will be live once the build completes!

## Environment Variables

Add these in Railway dashboard (Settings → Variables):

```
NODE_ENV=production
PORT=3000
CHILI_PIPER_FORM_URL=https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice
JWT_SECRET=<generate-with-openssl-rand-hex-32>
DEFAULT_API_KEY=<your-api-key-here>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD_HASH=<generate-with-node-scripts-generate-password-hash.js>
MAX_SCRAPING_TIMEOUT=30000
MAX_DAYS_TO_COLLECT=7
```

## How It Works

- **Dockerfile**: Uses Microsoft's official Playwright Docker image (`mcr.microsoft.com/playwright:v1.56.1-focal`)
- **Automatic Browser Installation**: Playwright browsers are pre-installed in the Docker image
- **System Dependencies**: All required system libraries are included in the base image
- **No Manual Setup**: Railway handles everything automatically

## Benefits Over Digital Ocean

✅ Playwright works out of the box (no installation issues)
✅ All system dependencies included in Docker image
✅ Simpler deployment process
✅ Better Playwright support
✅ Automatic deployments from GitHub

## Local Testing

To test the Docker setup locally:

```bash
# Build the image
docker build -t chili-piper-scraper .

# Run the container
docker run -p 3000:3000 --env-file .env chili-piper-scraper
```

## Troubleshooting

If you encounter issues:

1. Check Railway build logs for errors
2. Ensure all environment variables are set
3. Verify the Dockerfile is in the root directory
4. Check that `package.json` has the correct scripts

## Support

- Railway Docs: https://docs.railway.app
- Playwright Docker: https://playwright.dev/docs/docker

