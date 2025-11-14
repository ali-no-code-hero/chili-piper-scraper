# Performance Optimization Guide

## Current Status
- **Target**: 10-12 seconds (matching Next.js performance)
- **Current**: ~24 seconds
- **Issue**: Only collecting 1 day instead of 7

## Optimizations Applied

### ✅ Completed
1. **Disabled parallel processing** - Was slower due to double form submission overhead
2. **Fresh browser per request** - Matching Next.js behavior
3. **Aggressive resource blocking** - Blocks images, CSS, analytics, tracking
4. **Reduced wait times** - Minimized all timeout values
5. **Browser launch optimization** - Added Chrome flags for faster startup

## Resource Considerations

### Memory
**Can help if:**
- Browser instances are being killed due to OOM
- System is swapping (check with `free -h` or Activity Monitor)
- Multiple concurrent requests need more headroom

**Recommendation**: 4GB+ RAM minimum, 8GB+ recommended for production

### CPU
**Can help if:**
- Running multiple instances/requests in parallel
- CPU is consistently >80% (check with `top` or Activity Monitor)
- Multiple browser instances running simultaneously

**Recommendation**: 2+ CPU cores minimum, 4+ cores recommended

## Next Steps to Reach 12 Seconds

### 1. Fix Collection Logic
- Investigate why only 1 day is being collected
- Ensure navigation logic works correctly
- Verify early-exit conditions

### 2. Enable Browser Pooling (After Fix)
- Browser reuse can save 1-2s per request after first
- Only enable after fixing collection issues

### 3. Optimize Wait Times Further
- Reduce form wait times if possible
- Minimize calendar navigation waits
- Use smarter waiting (wait for selectors instead of fixed timeouts)

### 4. Consider Streaming
- Use `/api/get-slots-stream` endpoint
- Returns results incrementally for better perceived performance

## Environment Variables for Tuning

```bash
# Disable parallel processing (already disabled by default)
SCRAPE_ENABLE_CONCURRENT_DAYS=false

# Adjust max days to collect (fewer = faster)
SCRAPE_MAX_DAYS=7  # Default: 7

# Enable debug logging to see what's happening
SCRAPER_DEBUG=true
```

## Testing Performance

```bash
# Test with timing
time curl -X POST http://localhost:3000/api/get-slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer default-key-12345" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","phone":"1234567890"}'

# Check system resources
free -h  # Linux
vm_stat  # macOS
top      # Both
```







