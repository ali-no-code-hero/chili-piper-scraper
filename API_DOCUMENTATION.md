# Chili Piper Slot Scraper API Documentation

## Overview

The Chili Piper Slot Scraper API provides programmatic access to scrape available meeting slots from Chili Piper forms. The API supports both regular and streaming endpoints for different use cases.

## Base URL

```
https://your-domain.com/api
```

## Authentication

All API endpoints require authentication using Bearer tokens. Include the API key in the Authorization header:

```
Authorization: Bearer your-api-key-here
```

### Getting API Keys

Contact your administrator to obtain an API key. API keys are managed through the admin interface.

## Endpointsx

### 1. Get Available Slots (Regular)

**Endpoint:** `POST /api/get-slots`

**Description:** Scrapes available meeting slots and returns all results at once.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe", 
  "email": "john.doe@example.com",
  "phone": "5551234567"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_slots": 94,
    "total_days": 3,
    "note": "Found 3 days with 94 total booking slots",
    "slots": [
      {
        "date": "Wednesday 29th October  Wed29Oct",
        "time": "1:00 PM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "Wednesday 29th October  Wed29Oct", 
        "time": "1:15 PM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ]
  }
}
```

**Performance:** ~10-15 seconds response time

### 2. Get Available Slots (Streaming)

**Endpoint:** `POST /api/get-slots-per-day-stream`

**Description:** Streams available meeting slots as they are discovered, providing faster initial responses.

**Request Body:** Same as regular endpoint

**Response Format:** Server-Sent Events (SSE)

**Stream Example:**
```
data: {"success":true,"streaming":true,"message":"Starting slot collection...","data":{"total_slots":0,"total_days":0,"slots":[],"note":"Streaming results per day as they become available"}}

data: {"success":true,"streaming":true,"message":"Found 32 slots for Wednesday 29th October","data":{"total_slots":32,"total_days":1,"slots":[{"date":"Wednesday 29th October  Wed29Oct","time":"1:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"}],"note":"Streaming: 1/7 days collected"}}

data: {"success":true,"streaming":false,"message":"Slot collection completed","data":{"total_slots":94,"total_days":3,"note":"Found 3 days with 94 total booking slots","slots":[...]}}
```

**Performance:** ~4 seconds for first data, complete in ~10-15 seconds

### 3. Book Calendly Slot (AgentFire Demo)

**Endpoint:** `POST /api/book-calendly`

**Description:** Books an AgentFire demo slot on Calendly. **Dynamic data:** only `date`, `time`, `firstName`, `lastName`, `email`, and optionally `phone` are required. All other form questions use fixed default selections unless you override them via `answers`. Uses the same instance-reuse logic as the Chili Piper book-slot (one browser instance per email).

**Minimal Request (dynamic fields only; all other answers use defaults):**
```json
{
  "date": "2026-02-05",
  "time": "6:00am",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+15551234567"
}
```

**Request with optional overrides:** You can pass `answers` to override any default. Keys can be `question_0` … `question_9` or label-based.
```json
{
  "date": "2026-02-04",
  "time": "9:30am",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+15551234567",
  "answers": {
    "question_1": "Custom demo notes.",
    "Current Website URL:": "https://mywebsite.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| date | string | Yes | Date in `YYYY-MM-DD` format |
| time | string | Yes | Time slot, e.g. `9:30am` or `2:00 PM` |
| firstName | string | Yes | First name |
| lastName | string | Yes | Last name |
| email | string | Yes | Email address (used for instance reuse) |
| phone | string | No | Phone number (used for Phone Number question; recommended) |
| answers | object | No | Override default answers. If omitted, defaults are used for all questions. Keys: `question_0` … `question_9` or label-based. Single-choice: string; multi-choice: array of strings. |

**Default answers (used when `answers` is omitted or a key is not provided):** question_1: "AgentAdvice booking", question_2: "Agent", question_3: ["Build and strengthen my online brand"], question_4: "www.test.com", question_5: "A 'themed' website design that can be launched quickly", question_6: "N/A", question_7: "AGENTADVICE", question_8: ["Yes of course! "], question_9: "United States". Phone (question_0) is taken from `phone` when provided.

**Label-based answer keys (optional):** You can use these labels instead of `question_N` in `answers`:

- `"Phone Number"` → question_0  
- `"To help us prepare for your demo, please share a bit about yourself and what you're looking for with an AgentFire website."` → question_1  
- `"Which of the following best describes you:"` → question_2  
- `"Which of the following options best describe your goals with an AgentFire website? (Please select all that apply)"` → question_3  
- `"Current Website URL:"` → question_4  
- `"What best describes the type of website design you're looking for?"` → question_5  
- `"MLS Board(s) you belong to:"` → question_6  
- `"How'd you hear about AgentFire? (i.e. Received an Email, Google Search, Facebook Ad, Instagram Ad, Partner / Referral, etc.)"` → question_7  
- `"If something comes up and you need to reschedule, will you let us know ahead of your demo so that we can free up that time for someone else?"` → question_8  
- `"Your Location"` → question_9  

**Success Response (200):**
```json
{
  "success": true,
  "status": 200,
  "code": "OPERATION_SUCCESS",
  "data": {
    "message": "Calendly slot booked successfully",
    "date": "2026-02-04",
    "time": "9:30am"
  },
  "responseTime": 12000,
  "requestId": "req_..."
}
```

**Error Responses:**  
- `400` – Validation error (invalid date, time, or answers).  
- `500` – Slot not found, day not available, or form/booking failure.  
- `504` – Request timeout.

### 4. Health Check

**Endpoint:** `GET /api/health`

**Description:** Check if the service is running and healthy.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T01:56:28.904Z",
  "service": "Chili Piper Slot Scraper (Next.js)",
  "debug": {
    "node_version": "v20.19.5",
    "request_method": "GET",
    "request_url": "http://localhost:3000/api/health"
  }
}
```

## Admin Endpoints

### API Key Management

**Endpoint:** `POST /api/admin/api-keys`

**Description:** Manage API keys (create, update, delete, list)

**Authentication:** Requires admin JWT token

**Actions:**

#### Generate Admin Token
```json
{
  "action": "generate-admin-token"
}
```

#### Create API Key
```json
{
  "action": "create",
  "name": "Client Name",
  "description": "API key for client",
  "customKey": "optional-custom-key"
}
```

#### List API Keys
```json
{
  "action": "list"
}
```

#### Update API Key
```json
{
  "action": "update",
  "id": 1,
  "updates": {
    "name": "Updated Name",
    "is_active": true
  }
}
```

#### Delete API Key
```json
{
  "action": "delete",
  "id": 1
}
```

#### Get Usage Statistics
```json
{
  "action": "stats",
  "apiKeyId": 1
}
```

## Error Responses

### Authentication Error
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or missing API key. Please provide a valid Bearer token.",
  "usage": {
    "example": "Authorization: Bearer your-api-key-here"
  }
}
```

### Validation Error
```json
{
  "success": false,
  "error": "Missing required fields",
  "message": "The following fields are required: first_name, last_name"
}
```

### Scraping Error
```json
{
  "success": false,
  "error": "Scraping failed",
  "message": "Could not find calendar elements"
}
```

## Rate Limits

- **Regular API:** No specific rate limits (limited by server resources)
- **Streaming API:** No specific rate limits (limited by server resources)
- **Admin API:** Rate limited to prevent abuse

## Usage Tracking

All API usage is tracked including:
- Request count per API key
- Response times
- Success/failure rates
- IP addresses
- User agents

## Configuration

The scraper can be configured via environment variables:

- `CHILI_PIPER_FORM_URL`: Target Chili Piper form URL
- `MAX_DAYS_TO_COLLECT`: Maximum days to scrape (default: 7)
- `MAX_SCRAPING_TIMEOUT`: Timeout in milliseconds (default: 30000)

## Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://your-domain.com/api/get-slots', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key-here'
  },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '5551234567'
  })
});

const data = await response.json();
console.log(data);
```

### Python
```python
import requests

url = 'https://your-domain.com/api/get-slots'
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key-here'
}
data = {
    'first_name': 'John',
    'last_name': 'Doe',
    'email': 'john.doe@example.com',
    'phone': '5551234567'
}

response = requests.post(url, json=data, headers=headers)
result = response.json()
print(result)
```

### cURL
```bash
curl -X POST https://your-domain.com/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com", 
    "phone": "5551234567"
  }'
```

## Support

For technical support or API key requests, contact your system administrator.
