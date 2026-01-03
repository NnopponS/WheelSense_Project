# 503 Service Temporarily Unavailable Error Analysis

## Problem Summary

The frontend is experiencing 503 errors when making API requests to endpoints like:
- `/api/rooms`
- `/api/map/floors`
- `/api/map/config`
- `/api/map/buildings`

## Root Cause Analysis

### 1. **Backend Health Check**
✅ **Backend is running** on port 8000
✅ **MongoDB is connected** (health endpoint shows `"database": true`)
✅ **Endpoints work directly** when accessed at `http://localhost:8000/rooms`
✅ **Proxy works correctly** - requests through `http://localhost:3000/api/rooms` succeed

### 2. **Why 503 Errors Occur**

The 503 errors are likely caused by one of these scenarios:

#### Scenario A: Backend Initialization Race Condition
The FastAPI backend has a `lifespan` function that initializes:
- Database connection
- MQTT handler
- AI service
- Emergency service
- WebSocket servers

If the frontend makes requests **before** the backend finishes initializing, endpoints will return 503 because:
- The `db` global variable is `None` during initialization
- Endpoints check `if not db:` and return 503

**Code Reference** (`docker/mcp-server/src/main.py`):
```python
@app.get("/rooms")
async def get_rooms():
    """Get all rooms with their current status."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    rooms = await db.get_all_rooms()
    return {"rooms": rooms}
```

#### Scenario B: Database Connection Interruption
If MongoDB connection is temporarily lost or slow, endpoints will return 503.

#### Scenario C: Backend Restart
If the backend server restarts (e.g., after code changes), requests made during restart will fail with 503.

## Solutions

### Solution 1: Add Retry Logic in Frontend (Recommended)

Update the API service to automatically retry failed requests:

**File**: `services/dashboard/src/services/api.js`

Add retry logic to the `fetchAPI` function:

```javascript
async function fetchAPI(endpoint, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const baseUrl = getApiBase();
            const url = baseUrl.startsWith('http')
                ? `${baseUrl}${endpoint}`
                : `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                // If 503 and not last attempt, retry
                if (response.status === 503 && attempt < retries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
                    console.warn(`API request failed (503), retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (attempt === retries) {
                console.error(`API Error [${endpoint}]:`, error);
                throw error;
            }
            // Retry on network errors
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.warn(`API request failed, retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
```

### Solution 2: Improve Backend Startup

Ensure the backend is fully ready before accepting requests:

**File**: `docker/mcp-server/src/main.py`

Add a startup check that waits for all services:

```python
@app.on_event("startup")
async def startup_event():
    """Ensure all services are ready before accepting requests."""
    max_wait = 30  # seconds
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        if db and db.is_connected and mqtt_handler and mqtt_handler.is_connected:
            logger.info("✅ All services ready")
            return
        await asyncio.sleep(0.5)
    
    logger.warning("⚠️ Some services not ready after startup timeout")
```

### Solution 3: Add Health Check Before Making Requests

Update the frontend to check backend health before making API calls:

**File**: `services/dashboard/src/context/AppContext.jsx`

Add a health check on app initialization:

```javascript
useEffect(() => {
    const checkBackendHealth = async () => {
        try {
            const health = await checkHealth();
            if (health.status === 'healthy') {
                setBackendReady(true);
            }
        } catch (error) {
            console.error('Backend not ready:', error);
            // Retry after delay
            setTimeout(checkBackendHealth, 2000);
        }
    };
    
    checkBackendHealth();
}, []);
```

### Solution 4: Better Error Handling in Frontend

Show user-friendly messages for 503 errors:

**File**: `services/dashboard/src/services/api.js`

```javascript
if (!response.ok) {
    if (response.status === 503) {
        throw new Error('Service temporarily unavailable. Please wait a moment and refresh the page.');
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
}
```

## Immediate Fix

If you're currently experiencing 503 errors:

1. **Check if backend is running**:
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check backend logs** for initialization errors:
   ```bash
   # If running in Docker
   docker logs wheelsense-mcp
   
   # If running locally
   # Check the terminal where the backend is running
   ```

3. **Restart the backend** if needed:
   ```bash
   # Docker
   docker restart wheelsense-mcp
   
   # Local
   # Stop and restart the Python server
   ```

4. **Refresh the frontend** after ensuring backend is healthy

## Prevention

To prevent future 503 errors:

1. ✅ Implement retry logic (Solution 1)
2. ✅ Add health checks before critical operations
3. ✅ Monitor backend startup time
4. ✅ Add proper error boundaries in React components
5. ✅ Show loading states while backend initializes

## Testing

To verify the fix works:

1. Stop the backend: `docker stop wheelsense-mcp` (or kill the process)
2. Start the frontend and observe 503 errors
3. Start the backend: `docker start wheelsense-mcp`
4. With retry logic, requests should automatically succeed after backend is ready

































