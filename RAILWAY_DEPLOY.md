# Deploy Chili Piper Scraper on Railway

Railway is perfect for this application because it supports full Playwright with no serverless limitations.

## 🚀 Quick Deploy Steps

### 1. Sign Up for Railway

Go to https://railway.app and sign up with GitHub

### 2. Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository: `ali-no-code-hero/chili-piper-scraper`

### 3. Configure Build Settings (Railway will auto-detect, but here are the details)

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
npm start
```

**Install Command:**
```bash
npm install && npx playwright install chromium --with-deps
```

### 4. Environment Variables (if needed)

The application uses hardcoded API keys, so no environment variables are required.

### 5. Deploy!

Click **"Deploy"** and Railway will:
- ✅ Clone your repo
- ✅ Install dependencies
- ✅ Install Playwright
- ✅ Build your Next.js app
- ✅ Start the server

### 6. Get Your URL

Once deployed, Railway will provide a URL like:
```
https://chili-piper-scraper-production.up.railway.app
```

## 🧪 Test Your Deployment

```bash
curl -X POST https://YOUR_URL/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba" \
  -d '{
    "first_name": "AliTEST",
    "last_name": "SyedTEST",
    "email": "ali+test@mm.ventures",
    "phone": "5127673628"
  }'
```

## 💰 Railway Pricing

**Free Tier:**
- $5 free credits per month
- 500 hours runtime
- Perfect for development/testing

**Hobby Tier:**
- $5 per month
- Unlimited usage
- Great for production

## ✅ Advantages of Railway

- ✅ Native Playwright support
- ✅ No serverless size limits
- ✅ Auto deployments from GitHub
- ✅ Simple one-click setup
- ✅ Built-in monitoring
- ✅ Custom domains
- ✅ SSL included

## 📊 Monitoring

Railway provides:
- Real-time logs
- Metrics dashboard
- Build logs
- Deployment history

## 🔧 Troubleshooting

### Build Fails

If build fails, check logs in Railway dashboard. Common issues:
- Ensure `postinstall` script runs properly
- Check that Playwright installs successfully
- Verify Node.js version (should be 18+)

### Playwright Not Found

If you see "Playwright not installed" errors:
1. Check Railway logs for installation errors
2. Ensure `postinstall` script is in `package.json`
3. Restart the deployment

## 🎯 Next Steps

1. Deploy to Railway
2. Test the production API
3. Update your application URLs
4. Share the API endpoint with your team

## 📝 Notes

- Railway auto-deploys on every push to main branch
- You can configure custom domains in settings
- Monitor usage in the dashboard
- Scale horizontally if needed

