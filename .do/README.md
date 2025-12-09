# Digital Ocean App Platform Deployment

## Build Configuration

The app is configured to:
- Skip Playwright browser installation during build (installed at runtime if needed)
- Use dynamic imports for jsonwebtoken to avoid bundling issues
- Build with webpack for compatibility

## Environment Variables

Set these in App Platform dashboard:

```
CHILI_PIPER_FORM_URL=https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate-with-openssl-rand-hex-32>
DEFAULT_API_KEY=<your-api-key-here>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD_HASH=<generate-with-node-scripts-generate-password-hash.js>
MAX_SCRAPING_TIMEOUT=30000
MAX_DAYS_TO_COLLECT=7
```

## Playwright Browser

Playwright browser is installed automatically on first use. If you encounter issues, you can manually install it by running:

```bash
npm run install-playwright
```

This is handled automatically by the application.

## Build Command

```
npm install && npm run build
```

## Run Command

```
npm start
```

## Instance Size

Recommended: At least 1GB RAM for Playwright to work properly.

