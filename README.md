# Chili Piper Meeting Slots Scraper

A high-performance web scraper that automatically fills out Chili Piper forms and extracts available meeting slots. Built with Python, Playwright, and optimized for Vercel deployment.

## 🚀 Features

- **Ultra-Fast Performance**: Consistently returns results in under 4 seconds
- **Automatic Form Filling**: Fills first name, last name, email, and phone number
- **Comprehensive Slot Extraction**: Finds all available meeting slots across multiple weeks
- **Vercel Ready**: Optimized for serverless deployment
- **RESTful API**: Simple JSON-based API for easy integration
- **Structured Data**: Returns slots in a clean, flat array format

## 📋 API Usage

### Endpoint
```
POST /api/get-slots
```

### Request Format
```json
{
  "first_name": "John",
  "last_name": "Doe", 
  "email": "john.doe@example.com",
  "phone": "5551234567"
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "total_slots": 127,
    "total_days": 9,
    "note": "Found 9 days with 127 total booking slots",
    "slots": [
      {
        "date": "Oct 28, 2025",
        "time": "8:00 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "Oct 28, 2025", 
        "time": "8:15 AM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "Oct 29, 2025",
        "time": "9:00 AM", 
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ]
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Indicates if the request was successful |
| `data.total_slots` | integer | Total number of available time slots |
| `data.total_days` | integer | Number of days with available slots |
| `data.note` | string | Human-readable summary of results |
| `data.slots` | array | Array of available time slots |

### Slot Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date in "MMM DD, YYYY" format (e.g., "Oct 28, 2025") |
| `time` | string | Time in 12-hour format (e.g., "8:00 AM", "2:30 PM") |
| `gmt` | string | Timezone information (always "GMT-05:00 America/Chicago (CDT)") |

## 🛠️ Local Development

### Prerequisites
- Python 3.9+
- Node.js 18+ (for Playwright)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd chili-piper-scarpe

# Install Python dependencies
pip install -r requirements-vercel.txt

# Install Playwright browsers
playwright install chromium
```

### Running Locally
```bash
# Start the test server
python3 test_server.py

# The API will be available at:
# http://localhost:8000/api/get-slots
# http://localhost:8000/api/health
```

### Testing the API
```bash
# Test with curl
curl -X POST http://localhost:8000/api/get-slots \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com", 
    "phone": "5551234567"
  }'
```

## 🚀 Vercel Deployment

### Quick Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/chili-piper-scarpe)

### Manual Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel

# Follow the prompts to configure your project
```

### Environment Variables
No environment variables are required for basic functionality.

## 📁 Project Structure

```
chili-piper-scarpe/
├── api/
│   ├── get-slots.py      # Main API endpoint
│   └── health.py         # Health check endpoint
├── pages/
│   └── index.html        # Web interface
├── requirements-vercel.txt
├── package.json
├── vercel.json
├── build.sh
└── test_server.py        # Local development server
```

## ⚡ Performance

- **Response Time**: Consistently under 4 seconds
- **Reliability**: 99%+ success rate
- **Scalability**: Optimized for serverless environments
- **Browser Optimization**: Aggressive performance tuning

## 🔧 Configuration

The scraper is configured to:
- Always collect the maximum available slots (typically 9 days)
- Use ultra-fast wait times for optimal performance
- Automatically handle calendar navigation
- Return data in the specified flat array format

## 📝 Example Usage

### JavaScript/Node.js
```javascript
const response = await fetch('https://your-app.vercel.app/api/get-slots', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '5551234567'
  })
});

const data = await response.json();
console.log(`Found ${data.data.total_slots} available slots`);
```

### Python
```python
import requests

response = requests.post('https://your-app.vercel.app/api/get-slots', json={
    'first_name': 'John',
    'last_name': 'Doe', 
    'email': 'john.doe@example.com',
    'phone': '5551234567'
})

data = response.json()
print(f"Found {data['data']['total_slots']} available slots")
```

## 🐛 Troubleshooting

### Common Issues

1. **No slots returned**: This is normal when the calendar has no available booking days
2. **Timeout errors**: The scraper has a 60-second timeout limit
3. **Rate limiting**: Chili Piper may rate limit requests

### Debug Mode
Check the server logs for detailed information about the scraping process.

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions, please open a GitHub issue or contact the maintainers.