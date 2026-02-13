---
name: Error Handling & Resilience
description: Error handling patterns, retry logic, and resilience strategies across frontend and backend for stable WheelSense operation
---

# Error Handling & Resilience Patterns

## Frontend Error Handling

### API Layer (`lib/api.ts`)
The `fetchApi<T>()` wrapper handles all HTTP errors:

```typescript
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

**Convention**: API functions NEVER throw. They always return `{ data }` or `{ error }`.

### React Query Error Handling
When using React Query for data fetching:
```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ['wheelchairs'],
  queryFn: async () => {
    const res = await getWheelchairs();
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  staleTime: 5000,
});
```

### UI Error States
Always handle three states in components:
```typescript
if (isLoading) return <LoadingSkeleton />;
if (error) return <ErrorMessage message={error.message} />;
return <DataView data={data} />;
```

### Zustand Store Resilience
- Store uses `persist` middleware — state survives page reloads
- Mock data provides fallbacks when API is unavailable
- Actions validate input before updating state

---

## Backend Error Handling

### MQTT Reconnection (`core/mqtt.py`)
The `_listen_loop` handles connection loss:
```python
async def _listen_loop(self):
    while self._running:
        try:
            async with aiomqtt.Client(settings.MQTT_BROKER, ...) as client:
                await client.subscribe(settings.MQTT_TOPIC)
                async for message in client.messages:
                    await self._process_message(message)
        except aiomqtt.MqttError as e:
            print(f"MQTT error: {e}")
            if self._running:
                await asyncio.sleep(5)  # Wait before reconnecting
        except Exception as e:
            print(f"Unexpected error: {e}")
            if self._running:
                await asyncio.sleep(5)
```

**Key**: The outer `while` loop ensures automatic reconnection.

### Database Error Handling
The `Database` class should follow these patterns:
```python
# Good: Handle specific errors
try:
    await db.execute("INSERT INTO ...", params)
except Exception as e:
    print(f"Database error: {e}")
    raise HTTPException(status_code=500, detail="Database error")

# Good: Use transactions for multi-step operations
async with db.get_connection() as conn:
    await conn.execute("UPDATE ...", params1)
    await conn.execute("INSERT ...", params2)
    await conn.commit()
```

### Route Error Handling
```python
@router.get("/{item_id}")
async def get_item(item_id: str):
    row = await db.fetch_one("SELECT * FROM items WHERE id = ?", (item_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return row
```

### Background Task Resilience
```python
async def mark_stale_data_task():
    while True:
        try:
            await asyncio.sleep(10)
            # ... work ...
        except asyncio.CancelledError:
            break  # Graceful shutdown
        except Exception as e:
            print(f"Error: {e}")
            # Don't break — continue the loop
```

### Graceful Shutdown
The `lifespan` manager ensures ordered cleanup:
1. Cancel background tasks
2. Stop MQTT listening
3. Disconnect MQTT
4. Disconnect Home Assistant
5. Disconnect database

---

## Best Practices for New Features

### Adding a New API Endpoint
1. Use `try/except` in the route handler
2. Return appropriate HTTP status codes (404, 422, 500)
3. Log errors with context
4. Never expose internal details in error responses

### Adding a New Frontend Data Fetch
1. Use React Query with `retry: 3`
2. Handle loading, error, and empty states in UI
3. Provide fallback/mock data where appropriate
4. Use `staleTime` to reduce unnecessary refetches

### Adding a New Background Service
1. Wrap in `while True` with `try/except`
2. Handle `asyncio.CancelledError` for clean shutdown
3. Add `asyncio.sleep()` between iterations
4. Register cleanup in `lifespan` shutdown phase

### Adding MQTT Processing
1. Validate message format before processing
2. Use defensive access (`.get()` with defaults)
3. Wrap database writes in try/except
4. Log malformed messages for debugging
