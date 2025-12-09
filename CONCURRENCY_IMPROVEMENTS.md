# Concurrency Improvements

## Overview
This document describes the concurrency improvements implemented to handle multiple simultaneous requests efficiently and reliably.

## Changes Made

### 1. Concurrency Manager (`src/lib/concurrency-manager.ts`)
- **Semaphore-based limiting**: Limits the number of concurrent scraping operations
- **Request queuing**: Queues requests that exceed the concurrency limit
- **Timeout handling**: Automatically times out queued requests that wait too long
- **Configurable limits**: All limits can be configured via environment variables

**Default Settings:**
- Max concurrent requests: 3
- Max queue size: 50
- Queue timeout: 30 seconds

### 2. Multi-Browser Pool (`src/lib/browser-pool.ts`)
- **Multiple browser instances**: Supports multiple browser instances (default: 2)
- **Round-robin distribution**: Distributes requests across available browsers
- **Automatic cleanup**: Removes disconnected browsers automatically
- **Connection verification**: Verifies browser connection before use

**Benefits:**
- Better resource utilization
- Reduced contention between requests
- Improved reliability under load

### 3. API Route Updates (`src/app/api/get-slots/route.ts`)
- **Integrated concurrency manager**: All scraping operations go through the queue
- **Better error handling**: Specific error messages for queue timeouts and full queue
- **Status logging**: Logs concurrency status for monitoring

### 4. Status Endpoint (`src/app/api/status/route.ts`)
- **Real-time monitoring**: Check current concurrency and browser pool status
- **Utilization metrics**: See percentage utilization of resources
- **Queue information**: View active, queued, and capacity metrics

## Configuration

Add these environment variables to configure concurrency:

```bash
# Maximum concurrent scraping operations (default: 3)
MAX_CONCURRENT_REQUESTS=3

# Maximum queue size for pending requests (default: 50)
MAX_QUEUE_SIZE=50

# Queue timeout in milliseconds (default: 30000 = 30 seconds)
QUEUE_TIMEOUT_MS=30000

# Maximum browser instances in pool (default: 2)
MAX_BROWSER_POOL_SIZE=2
```

## Usage

### Check Status
```bash
curl https://your-domain.com/api/status
```

Response:
```json
{
  "success": true,
  "data": {
    "concurrency": {
      "active": 2,
      "queued": 5,
      "capacity": 3,
      "queueSize": 50,
      "utilization": "66.7%"
    },
    "browsers": {
      "active": 2,
      "max": 2,
      "utilization": "100.0%"
    },
    "timestamp": "2025-12-09T22:00:00.000Z"
  }
}
```

### Making Requests
Requests are automatically queued if the concurrency limit is reached. The API will:
1. Accept the request immediately
2. Queue it if all slots are busy
3. Execute it when a slot becomes available
4. Return results when complete

**Error Responses:**
- `503 Service Unavailable`: Queue is full
- `504 Gateway Timeout`: Request timed out in queue or during execution

## Performance Impact

### Before
- Single browser instance
- No concurrency limiting
- Race conditions under load
- Browser crashes with high concurrency

### After
- Multiple browser instances (configurable)
- Controlled concurrency (default: 3 simultaneous)
- Request queuing for overflow
- Better error handling and recovery

## Capacity Estimates

### Low Load (1-3 concurrent requests)
- ✅ Works perfectly
- No queuing needed
- Fast response times

### Medium Load (4-10 concurrent requests)
- ✅ Handled gracefully
- Requests queued automatically
- Slight delay for queued requests

### High Load (10+ concurrent requests)
- ✅ System remains stable
- Queue manages overflow
- Timeout protection prevents resource exhaustion

## Monitoring

Monitor these metrics:
1. **Active requests**: Should stay below capacity
2. **Queued requests**: Should stay below queue size
3. **Browser utilization**: Should be balanced across instances
4. **Error rates**: Should decrease with these improvements

## Future Enhancements

1. **Distributed rate limiting**: Use Redis for multi-instance deployments
2. **Dynamic scaling**: Adjust concurrency based on system load
3. **Priority queue**: Prioritize certain requests
4. **Metrics export**: Export metrics to monitoring systems

