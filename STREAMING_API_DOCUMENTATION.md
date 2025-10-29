# Chili Piper Streaming API - Frontend Implementation Guide

## Overview
This API provides real-time streaming of available meeting slots from Chili Piper. Instead of waiting for all data to be collected, slots are streamed per day as they become available, providing a much faster user experience.

## API Endpoint
```
POST /api/get-slots-per-day-stream
```

## Authentication
All requests must include a Bearer token in the Authorization header:
```
Authorization: Bearer cp_live_demo_client_key_2024_secure_987654321fedcba
```

## Request Format
```json
{
  "first_name": "John",
  "last_name": "Doe", 
  "email": "john.doe@example.com",
  "phone": "5551234567"
}
```

## Response Format (Server-Sent Events)
The API returns Server-Sent Events (SSE) with the following structure:

### Initial Response
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

### Per-Day Streaming Responses
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
      },
      {
        "date": "Tuesday 28th October  Tue28Oct", 
        "time": "12:45 PM",
        "gmt": "GMT-05:00 America/Chicago (CDT)"
      }
    ],
    "note": "Streaming: 1/7 days collected"
  }
}
```

### Final Completion Response
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

## Performance Characteristics
- **First data response**: ~4 seconds
- **Total completion**: ~10 seconds
- **Data arrives**: Per day as collected
- **Maximum days**: 7 days
- **Typical slots per day**: 12-35 slots

## WordPress Implementation Examples

### 1. JavaScript Fetch API Implementation

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
    updateSlotsDisplay(data.data.slots, data.data.total_days, data.data.total_slots);
  } else {
    // Final completion
    console.log('All slots collected:', data.data.total_slots);
    showCompletionMessage(data.data);
  }
}
```

### 2. EventSource Implementation (Simpler)

```javascript
function startSlotStreaming(formData) {
  // Note: EventSource doesn't support POST, so you'd need to use a different approach
  // This is shown for reference - use the Fetch API approach above
  
  const eventSource = new EventSource('/api/get-slots-per-day-stream');
  
  eventSource.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      handleStreamingData(data);
    } catch (e) {
      console.error('Error parsing SSE data:', e);
    }
  };
  
  eventSource.onerror = function(event) {
    console.error('EventSource failed:', event);
    eventSource.close();
  };
}
```

### 3. WordPress AJAX Implementation

```php
// In your WordPress theme's functions.php or plugin

function enqueue_slot_booking_scripts() {
    wp_enqueue_script('slot-booking', get_template_directory_uri() . '/js/slot-booking.js', array('jquery'), '1.0.0', true);
    wp_localize_script('slot-booking', 'ajax_object', array(
        'ajax_url' => admin_url('admin-ajax.php'),
        'api_endpoint' => 'https://your-domain.com/api/get-slots-per-day-stream'
    ));
}
add_action('wp_enqueue_scripts', 'enqueue_slot_booking_scripts');

// AJAX handler for WordPress
function handle_slot_booking_request() {
    $first_name = sanitize_text_field($_POST['first_name']);
    $last_name = sanitize_text_field($_POST['last_name']);
    $email = sanitize_email($_POST['email']);
    $phone = sanitize_text_field($_POST['phone']);
    
    // Forward request to your API
    $response = wp_remote_post('https://your-domain.com/api/get-slots-per-day-stream', array(
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

### 4. Complete HTML/JavaScript Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Chili Piper Slot Booking</title>
    <style>
        .slot-container { margin: 20px 0; }
        .day-slots { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
        .slot { display: inline-block; margin: 5px; padding: 8px 12px; background: #f0f0f0; cursor: pointer; }
        .slot:hover { background: #e0e0e0; }
        .loading { color: #666; }
        .progress { margin: 10px 0; }
    </style>
</head>
<body>
    <form id="booking-form">
        <input type="text" name="first_name" placeholder="First Name" required>
        <input type="text" name="last_name" placeholder="Last Name" required>
        <input type="email" name="email" placeholder="Email" required>
        <input type="tel" name="phone" placeholder="Phone" required>
        <button type="submit">Find Available Slots</button>
    </form>
    
    <div id="loading" class="loading" style="display: none;">
        Loading available slots...
    </div>
    
    <div id="progress" class="progress" style="display: none;">
        <div id="progress-text">Starting...</div>
    </div>
    
    <div id="slots-container" class="slot-container"></div>
    
    <script>
        document.getElementById('booking-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                first_name: this.first_name.value,
                last_name: this.last_name.value,
                email: this.email.value,
                phone: this.phone.value
            };
            
            document.getElementById('loading').style.display = 'block';
            document.getElementById('progress').style.display = 'block';
            document.getElementById('slots-container').innerHTML = '';
            
            try {
                await fetchStreamingSlots(formData);
            } catch (error) {
                console.error('Error:', error);
                alert('Error loading slots: ' + error.message);
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        });
        
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
                    buffer = lines.pop();
                    
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
                updateProgress(data.message, data.data.total_days, data.data.total_slots);
                addSlotsToDisplay(data.data.slots);
            } else {
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
            
            // Add each day's slots
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
        
        function selectSlot(slot) {
            alert(`Selected: ${slot.date} at ${slot.time}`);
            // Implement your booking logic here
        }
    </script>
</body>
</html>
```

## Key Implementation Notes

### 1. CORS Considerations
If your WordPress site is on a different domain, you may need to handle CORS. The API includes CORS headers, but ensure your WordPress site can make cross-origin requests.

### 2. Error Handling
Always implement proper error handling for:
- Network failures
- Invalid responses
- Authentication errors
- Timeout scenarios

### 3. User Experience
- Show loading indicators
- Display progress as data streams in
- Allow users to see and select slots as they become available
- Provide feedback on completion

### 4. Performance
- The API is optimized for speed (4-second first response)
- Consider caching strategies for frequently requested data
- Implement proper cleanup of event listeners

### 5. Security
- Never expose API keys in client-side code
- Use WordPress AJAX handlers to proxy requests
- Validate and sanitize all user inputs
- Implement rate limiting if needed

## Testing the API

You can test the API directly using curl:

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

## Support
For technical support or questions about implementation, contact the development team.
