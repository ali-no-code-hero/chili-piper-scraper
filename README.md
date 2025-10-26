# Chili Piper Slot Scraper

A modern Next.js application that automatically scrapes available meeting slots from Chili Piper using Playwright browser automation.

## 🚀 Features

- **Modern React Frontend**: Beautiful UI built with Next.js 16 and Tailwind CSS
- **Automated Scraping**: Uses Playwright to navigate and extract slot data
- **API Authentication**: Secure API endpoints with token-based authentication
- **Vercel Deployment**: Optimized for serverless deployment on Vercel
- **TypeScript**: Full type safety throughout the application
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🏗️ Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/          # Health check endpoint
│   │   │   ├── get-slots/       # Main scraping API
│   │   │   ├── get-slots-mock/  # Mock data for testing
│   │   │   └── test-simple/     # Simple test endpoint
│   │   ├── globals.css          # Global styles
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Main page component
│   └── lib/
│       └── scraper.ts           # Playwright scraping logic
├── next.config.js               # Next.js configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies and scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ali-no-code-hero/chili-piper-scraper.git
   cd chili-piper-scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run locally**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## 🌐 API Usage

### Authentication

All API endpoints require authentication using a Bearer token:

```bash
Authorization: Bearer your-api-key-here
```

**Available API Keys:**
- `test-key-123` (for testing)
- `prod-key-456` (for production)
- `dev-key-789` (for development)

### Endpoints

#### Health Check
```bash
GET /api/health
```

#### Get Available Slots
```bash
POST /api/get-slots
Content-Type: application/json
Authorization: Bearer test-key-123

{
  "first_name": "John",
  "last_name": "Doe", 
  "email": "john@example.com",
  "phone": "1234567890"
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "total_slots": 127,
    "total_days": 5,
    "note": "Found 5 days with 127 total booking slots",
    "slots": [
      {
        "date": "Monday, Oct 28, 2025",
        "time": "8:00 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "Monday, Oct 28, 2025", 
        "time": "8:35 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ]
  }
}
```

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect Next.js and configure everything

2. **Deploy**
   - Push to `main` branch triggers automatic deployment
   - Your app will be available at `https://your-app.vercel.app`

### Manual Deployment

```bash
# Build the application
npm run build

# Start production server
npm start
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### Environment Variables

No environment variables required for basic functionality. The application uses hardcoded API keys for simplicity.

## 🔧 Configuration

### Playwright Configuration

The application uses Playwright with optimized settings for serverless environments:

- Headless browser mode
- Disabled images, CSS, and fonts for faster loading
- Optimized browser arguments for Vercel's serverless functions

### Tailwind CSS

The application uses Tailwind CSS for styling with a custom configuration optimized for the UI components.

## 🐛 Troubleshooting

### Common Issues

1. **API Returns 405 Method Not Allowed**
   - Ensure you're using POST method for `/api/get-slots`
   - Check that the request includes proper headers

2. **Playwright Installation Issues**
   - Run `npx playwright install chromium` manually
   - Ensure you're using Node.js 18+

3. **Build Failures**
   - Clear `.next` directory: `rm -rf .next`
   - Reinstall dependencies: `rm -rf node_modules && npm install`

## 📝 License

ISC License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section above
- Review the API documentation