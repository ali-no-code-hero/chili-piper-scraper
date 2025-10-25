# Chili Piper Slot Scraper - Vercel Deployment

This version of the Chili Piper Slot Scraper is optimized for deployment on Vercel using serverless functions and Playwright.

## 🚀 Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/chili-piper-scarpe)

## 📁 Project Structure

```
chili-piper-scarpe/
├── api/
│   ├── get-slots.py      # Main API endpoint (serverless function)
│   └── health.py         # Health check endpoint
├── pages/
│   └── index.html        # Frontend interface
├── vercel.json           # Vercel configuration
├── package.json          # Node.js dependencies
├── build.sh             # Build script for Playwright
└── requirements-vercel.txt # Python dependencies
```

## 🛠️ Local Development

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run locally:**
   ```bash
   vercel dev
   ```

4. **Access the application:**
   - Open `http://localhost:3000` in your browser

## 🌐 Deployment Steps

### Option 1: Deploy via Vercel CLI

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Deploy:**
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via GitHub

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Deploy to Vercel"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will automatically deploy

## 🔧 Configuration

### Environment Variables (Optional)

You can set these in your Vercel dashboard:

- `CHILI_PIPER_URL` - The Chili Piper form URL (default: current URL)
- `MAX_DAYS_TO_CHECK` - Maximum days to check (default: 10)
- `DEFAULT_DAYS_TO_CHECK` - Default days to check (default: 5)

### Function Settings

The API functions are configured with:
- **Timeout:** 60 seconds for `get-slots.py`
- **Timeout:** 10 seconds for `health.py`
- **Memory:** Default Vercel limits

## 📡 API Usage

### Health Check
```bash
GET https://your-app.vercel.app/api/health
```

### Get Available Slots
```bash
POST https://your-app.vercel.app/api/get-slots
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "5551234567",
  "days": 5
}
```

## 🎯 Features

- ✅ **Serverless Functions** - Runs on Vercel's edge network
- ✅ **Playwright Integration** - Modern browser automation
- ✅ **CORS Support** - Ready for cross-origin requests
- ✅ **Error Handling** - Comprehensive error responses
- ✅ **Responsive UI** - Mobile-friendly interface
- ✅ **Real-time Feedback** - Loading states and progress indicators

## 🔍 How It Works

1. **User submits form** with their details
2. **API function launches** Playwright browser
3. **Navigates to Chili Piper** form page
4. **Fills out the form** with provided data
5. **Submits and waits** for redirect to slots page
6. **Scrapes available slots** for specified number of days
7. **Returns structured data** to the frontend

## ⚠️ Limitations

- **Function Timeout:** 60 seconds maximum (Vercel limit)
- **Cold Starts:** First request may be slower
- **Rate Limiting:** Be mindful of Chili Piper's rate limits
- **Browser Resources:** Playwright uses significant memory

## 🐛 Troubleshooting

### Common Issues

1. **Function Timeout:**
   - Reduce the number of days to check
   - The function has a 60-second limit

2. **Playwright Not Found:**
   - Ensure `build.sh` is executable
   - Check that Playwright is installed during build

3. **CORS Errors:**
   - The API includes CORS headers
   - Make sure you're using the correct domain

4. **Form Not Filling:**
   - Chili Piper may have changed their form structure
   - Check the browser console for errors

### Debug Mode

To debug locally:
```bash
# Run with debug logging
DEBUG=* vercel dev
```

## 📊 Monitoring

- **Vercel Dashboard:** Monitor function performance
- **Function Logs:** Check execution logs
- **Health Endpoint:** Monitor service status

## 🔄 Updates

To update the deployment:
```bash
git add .
git commit -m "Update scraper"
git push origin main
# Vercel will automatically redeploy
```

## 📝 Notes

- This version uses Playwright instead of Selenium for better Vercel compatibility
- The scraper runs in a headless browser environment
- All functions are stateless and can scale automatically
- The frontend is served as static files for optimal performance
