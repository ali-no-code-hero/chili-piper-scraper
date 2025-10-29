# Chili Piper Slot Booking APIs - Complete Guide

## Overview
We provide two API options for retrieving available meeting slots from Chili Piper:

1. **Regular API** - Returns all slots at once after completion
2. **Streaming API** - Returns slots per day as they become available

Choose the API that best fits your use case and user experience requirements.

---

## 🔄 Regular API (Traditional)

### Endpoint
```
POST /api/get-slots
```

### When to Use
- Simple implementation preferred
- Can wait for complete data set
- Batch processing scenarios
- Lower complexity requirements

### Performance
- **Response time**: ~12 seconds
- **Data delivery**: All at once
- **User experience**: Wait for complete results

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
    "total_slots": 207,
    "total_days": 7,
    "note": "Found 7 days with 207 total booking slots",
    "slots": [
      {
        "date": "Tuesday 28th October  Tue28Oct",
        "time": "12:30 PM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      },
      {
        "date": "Tuesday 28th October  Tue28Oct",
        "time": "12:45 PM", 
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
      // ... all 207 slots
    ]
  }
}
```

### WordPress Implementation (Regular API)
```javascript
async function fetchAllSlots(formData) {
  try {
    const response = await fetch('/api/get-slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cp_live_demo_client_key_2024_secure_987654321fedcba'
      },
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      displayAllSlots(data.data.slots);
    } else {
      throw new Error(data.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error fetching slots:', error);
    alert('Error loading slots: ' + error.message);
  }
}

function displayAllSlots(slots) {
  const container = document.getElementById('slots-container');
  container.innerHTML = '';
  
  // Group slots by date
  const slotsByDate = {};
  slots.forEach(slot => {
    if (!slotsByDate[slot.date]) {
      slotsByDate[slot.date] = [];
    }
    slotsByDate[slot.date].push(slot);
  });
  
  // Display all days at once
  Object.keys(slotsByDate).forEach(date => {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-slots';
    dayDiv.innerHTML = `<h3>${date}</h3>`;
    
    const slotsDiv = document.createElement('div');
    slotsDiv.className = 'slots';
    
    slotsByDate[date].forEach(slot => {
      const slotElement = document.createElement('span');
      slotElement.className = 'slot';
      slotElement.textContent = slot.time;
      slotElement.onclick = () => selectSlot(slot);
      slotsDiv.appendChild(slotElement);
    });
    
    dayDiv.appendChild(slotsDiv);
    container.appendChild(dayDiv);
  });
}
```

---

## ⚡ Streaming API (Real-time)

### Endpoint
```
POST /api/get-slots-per-day-stream
```

### When to Use
- Fast user experience required
- Progressive loading preferred
- Real-time updates needed
- Modern web applications

### Performance
- **First data**: ~4 seconds
- **Complete data**: ~10 seconds
- **Data delivery**: Per day as available
- **User experience**: Immediate feedback

### Request Format
```json
{
  "first_name": "John",
  "last_name": "Doe", 
  "email": "john.doe@example.com",
  "phone": "5551234567"
}
```

### Response Format (Server-Sent Events)
The API returns Server-Sent Events (SSE) with multiple responses:

#### Initial Response
```json
{
  "success": true,
  "streaming": true,
  "message": "Starting slot collection...",
  "data": {
    "total_slots": 0,
    "total_days": 0,
    "slots": [],
    "note": "Streaming results per day as they become available"
  }
}
```

#### Per-Day Streaming Responses
```json
{
  "success": true,
  "streaming": true,
  "message": "Found 12 slots for Tuesday 28th October  Tue28Oct",
  "data": {
    "total_slots": 12,
    "total_days": 1,
    "slots": [
      {
        "date": "Tuesday 28th October  Tue28Oct",
        "time": "12:30 PM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
      // ... 11 more slots for this day
    ],
    "note": "Streaming: 1/7 days collected"
  }
}
```

#### Final Completion Response
```json
{
  "success": true,
  "streaming": false,
  "message": "Slot collection completed",
  "data": {
    "total_slots": 207,
    "total_days": 7,
    "note": "Found 7 days with 207 total booking slots",
    "slots": [
      // All slots from all days combined
    ]
  }
}
```

### WordPress Implementation (Streaming API)
```javascript
async function fetchStreamingSlots(formData) {
  const response = await fetch('/api/get-slots-per-day-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer cp_live_demo_client_key_2024_secure_987654321fedcba'
    },
    body: JSON.stringify(formData)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleStreamingData(data);
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function handleStreamingData(data) {
  if (data.streaming) {
    // Update UI with new day's slots
    updateProgress(data.message, data.data.total_days, data.data.total_slots);
    addSlotsToDisplay(data.data.slots);
  } else {
    // Final completion
    updateProgress('Complete!', data.data.total_days, data.data.total_slots);
    document.getElementById('loading').style.display = 'none';
  }
}

function updateProgress(message, days, totalSlots) {
  document.getElementById('progress-text').textContent = 
    `${message} (${days}/7 days, ${totalSlots} total slots)`;
}

function addSlotsToDisplay(slots) {
  const container = document.getElementById('slots-container');
  
  // Group slots by date
  const slotsByDate = {};
  slots.forEach(slot => {
    if (!slotsByDate[slot.date]) {
      slotsByDate[slot.date] = [];
    }
    slotsByDate[slot.date].push(slot);
  });
  
  // Add each day's slots as they arrive
  Object.keys(slotsByDate).forEach(date => {
    let dayContainer = document.getElementById(`day-${date}`);
    if (!dayContainer) {
      dayContainer = document.createElement('div');
      dayContainer.id = `day-${date}`;
      dayContainer.className = 'day-slots';
      dayContainer.innerHTML = `<h3>${date}</h3>`;
      container.appendChild(dayContainer);
    }
    
    const slotsDiv = dayContainer.querySelector('.slots') || 
      (() => {
        const div = document.createElement('div');
        div.className = 'slots';
        dayContainer.appendChild(div);
        return div;
      })();
    
    slotsByDate[date].forEach(slot => {
      const slotElement = document.createElement('span');
      slotElement.className = 'slot';
      slotElement.textContent = slot.time;
      slotElement.onclick = () => selectSlot(slot);
      slotsDiv.appendChild(slotElement);
    });
  });
}
```

---

## 🔧 Common Implementation Elements

### Authentication
Both APIs require the same authentication:
```javascript
headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer cp_live_demo_client_key_2024_secure_987654321fedcba'
}
```

### Error Handling
```javascript
function handleApiError(error, response) {
  if (response && response.status === 401) {
    alert('Authentication failed. Please check your API key.');
  } else if (response && response.status === 400) {
    alert('Invalid request. Please check your input data.');
  } else {
    alert('Error: ' + error.message);
  }
}
```

### WordPress AJAX Handler (Both APIs)
```php
// In functions.php or plugin
function handle_slot_booking_request() {
    $first_name = sanitize_text_field($_POST['first_name']);
    $last_name = sanitize_text_field($_POST['last_name']);
    $email = sanitize_email($_POST['email']);
    $phone = sanitize_text_field($_POST['phone']);
    $api_type = sanitize_text_field($_POST['api_type']); // 'regular' or 'streaming'
    
    $endpoint = $api_type === 'streaming' 
        ? 'https://your-domain.com/api/get-slots-per-day-stream'
        : 'https://your-domain.com/api/get-slots';
    
    $response = wp_remote_post($endpoint, array(
        'headers' => array(
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer cp_live_demo_client_key_2024_secure_987654321fedcba'
        ),
        'body' => json_encode(array(
            'first_name' => $first_name,
            'last_name' => $last_name,
            'email' => $email,
            'phone' => $phone
        )),
        'timeout' => 30
    ));
    
    if (is_wp_error($response)) {
        wp_die('Error: ' . $response->get_error_message());
    }
    
    wp_die();
}
add_action('wp_ajax_book_slots', 'handle_slot_booking_request');
add_action('wp_ajax_nopriv_book_slots', 'handle_slot_booking_request');
```

---

## 📊 API Comparison

| Feature | Regular API | Streaming API |
|---------|-------------|---------------|
| **Endpoint** | `/api/get-slots` | `/api/get-slots-per-day-stream` |
| **First Data** | ~12 seconds | ~4 seconds |
| **Complete Data** | ~12 seconds | ~10 seconds |
| **Implementation** | Simple | Moderate |
| **User Experience** | Wait for all | Progressive |
| **Data Format** | JSON | Server-Sent Events |
| **Error Handling** | Standard | Stream-aware |
| **Best For** | Simple apps | Modern UX |

---

## 🎯 Recommendation Guide

### Choose Regular API if:
- ✅ Simple implementation preferred
- ✅ Can wait 12 seconds for complete data
- ✅ Batch processing scenarios
- ✅ Lower development complexity
- ✅ Legacy system integration

### Choose Streaming API if:
- ✅ Fast user experience required
- ✅ Progressive loading preferred
- ✅ Real-time updates needed
- ✅ Modern web application
- ✅ User engagement is priority

---

## 🧪 Testing Both APIs

### Test Regular API
```bash
curl -X POST https://your-domain.com/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567"
  }'
```

### Test Streaming API
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

---

## 📞 Support

For technical support or questions about either API implementation, contact the development team.
