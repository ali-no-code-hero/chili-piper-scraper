# Sample API Response - Chili Piper Streaming API

## Example Request
```bash
curl -X POST https://your-domain.com/api/get-slots-per-day-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'
```

## Sample Response Stream

The API returns Server-Sent Events (SSE) with the following sequence:

### 1. Initial Response (~0 seconds)
```
data: {"success":true,"streaming":true,"message":"Starting slot collection...","data":{"total_slots":0,"total_days":0,"slots":[],"note":"Streaming results per day as they become available"}}
```

### 2. First Day Data (~4 seconds)
```
data: {"success":true,"streaming":true,"message":"Found 12 slots for Tuesday 28th October  Tue28Oct","data":{"total_slots":12,"total_days":1,"slots":[{"date":"Tuesday 28th October  Tue28Oct","time":"12:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"12:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"1:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"1:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"1:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"1:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"2:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"3:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"3:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"3:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"4:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Tuesday 28th October  Tue28Oct","time":"4:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"}],"note":"Streaming: 1/7 days collected"}}
```

### 3. Second Day Data (~5 seconds)
```
data: {"success":true,"streaming":true,"message":"Found 34 slots for Wednesday 29th October  Wed29Oct","data":{"total_slots":46,"total_days":2,"slots":[{"date":"Wednesday 29th October  Wed29Oct","time":"8:00 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"8:15 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"8:30 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"8:45 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"9:00 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"9:15 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"9:30 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"9:45 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"10:00 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"10:15 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"10:30 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"10:45 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"11:00 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"11:15 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"11:30 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"11:45 AM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"12:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"12:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"12:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"12:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"1:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"1:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"1:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"1:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"2:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"2:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"2:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"2:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"3:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"3:15 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"3:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"3:45 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"4:00 PM","gmt":"GMT-05:00 America/Chicago (CDT)"},{"date":"Wednesday 29th October  Wed29Oct","time":"4:30 PM","gmt":"GMT-05:00 America/Chicago (CDT)"}],"note":"Streaming: 2/7 days collected"}}
```

### 4. Final Completion Response (~10 seconds)
```
data: {"success":true,"streaming":false,"message":"Slot collection completed","data":{"total_slots":207,"total_days":7,"note":"Found 7 days with 207 total booking slots","slots":[/* All 207 slots from all 7 days */]}}
```

## Response Structure Breakdown

### Streaming Response Fields
- `success`: Boolean indicating if the request was successful
- `streaming`: Boolean indicating if more data is coming (true) or this is the final response (false)
- `message`: Human-readable status message
- `data`: Object containing the actual slot data

### Data Object Fields
- `total_slots`: Running total of all slots collected so far
- `total_days`: Number of days processed so far
- `slots`: Array of slot objects for the current day
- `note`: Additional information about progress

### Individual Slot Object Structure
```json
{
  "date": "Tuesday 28th October  Tue28Oct",
  "time": "12:30 PM", 
  "gmt": "GMT-05:00 America/Chicago (CDT)"
}
```

## Performance Timeline
- **0-4 seconds**: Form submission, navigation, calendar loading
- **~4 seconds**: First day's slots arrive (12 slots)
- **~5 seconds**: Second day's slots arrive (34 slots)
- **~6 seconds**: Third day's slots arrive (32 slots)
- **~7 seconds**: Fourth day's slots arrive (31 slots)
- **~8 seconds**: Fifth day's slots arrive (33 slots)
- **~9 seconds**: Sixth day's slots arrive (30 slots)
- **~10 seconds**: Seventh day's slots arrive (35 slots)
- **~10 seconds**: Final completion response

## Error Response Example
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

## WordPress Integration Notes

### 1. Server-Sent Events Support
WordPress doesn't natively support SSE, so you'll need to use JavaScript Fetch API with ReadableStream.

### 2. CORS Configuration
Ensure your WordPress site can make requests to the API domain. The API includes CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 3. Proxy Implementation
For security, consider implementing a WordPress AJAX handler that proxies requests to the API, keeping the API key server-side.

### 4. Real-time Updates
The streaming nature means users see slots appear in real-time, providing excellent UX. Implement progressive loading in your UI to show slots as they arrive.

