# Digital Ocean App Platform Deployment

## Quick Setup

1. Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect your GitHub repository: `ali-no-code-hero/chili-piper-scraper`
4. App Platform will auto-detect Next.js

## Build Settings

- **Build Command**: `npm install && npm run build`
- **Run Command**: `npm start`
- **Environment**: Node.js
- **Node Version**: 20.x or higher

## Required Environment Variables

Add these in the App Platform dashboard under Settings → App-Level Environment Variables:

```
CHILI_PIPER_FORM_URL=https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate-with-openssl-rand-hex-32>
DEFAULT_API_KEY=<your-api-key-here>
API_KEYS=<optional-comma-separated-keys>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD_HASH=<generate-with-node-scripts-generate-password-hash.js>
MAX_SCRAPING_TIMEOUT=30000
MAX_DAYS_TO_COLLECT=7
```

## Generate Secrets

**JWT Secret**:
```bash
openssl rand -hex 32
```

**Admin Password Hash**:
```bash
node scripts/generate-password-hash.js yourSecurePassword123
```

## Instance Size

Recommended: **Basic** plan with at least **512MB RAM** (1GB recommended for Playwright)

## Automatic Deployments

App Platform automatically deploys on every push to the main branch.

## Health Check

After deployment, test:
```
curl https://your-app.ondigitalocean.app/api/health
```

## Notes

- Playwright browser is installed automatically via `postinstall` script
- All security is handled by App Platform (SSL, firewall, etc.)
- No need to configure Nginx or PM2 - App Platform handles it

