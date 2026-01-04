# Database-First Architecture Implementation

## Overview

This document describes the database-first architecture improvements inspired by `mcp_llm-wheelsense`. The `device_states` table is now the **single source of truth** for device states, with the `appliances` table kept for backward compatibility and metadata.

## Architecture Changes

### Before
- Device states stored in both `appliances` table and `device_states` table
- Frontend maintained separate React state (`appliances`) synced via WebSocket + REST polling
- Inconsistent state management between tables
- Complex sync logic between multiple sources

### After
- **`device_states` table is the single source of truth**
- Frontend reads directly from database via `/api/device-states` endpoint
- WebSocket updates trigger database refreshes for consistency
- Simplified state management with database as authoritative source

## Implementation Details

### Backend Changes

#### 1. `e_device_control` Tool Handler (`docker/backend/src/services/tool_handlers.py`)
- **Changed**: Now updates `device_states` table FIRST (source of truth)
- **Then**: Syncs to `appliances` table for backward compatibility
- **Result**: Database-first approach ensures consistency

```python
# Step 1: Update device_states table (source of truth)
await db.set_device_state(normalized_room, normalized_device, new_state)

# Step 2: Sync to appliances table (backward compatibility)
await db.db.appliances.update_many(...)
```

#### 2. `/appliances/control` Endpoint (`docker/backend/src/api/appliances.py`)
- **Changed**: Same database-first approach
- Updates `device_states` first, then syncs to `appliances`
- Ensures all device control paths use the same architecture

### Frontend Changes

#### 1. Device States Loading (`docker/services/dashboard/src/context/AppContext.jsx`)
- **Added**: New `useEffect` hook that loads device states from database on startup
- **Added**: Polling every 3 seconds to keep device states fresh
- **Result**: Frontend always has latest state from database

```javascript
// Load device states from database on startup and poll for updates
useEffect(() => {
    const loadDeviceStates = async () => {
        const response = await api.getAllDeviceStates();
        if (response && response.device_states) {
            setDeviceStates(response.device_states);
        }
    };
    loadDeviceStates();
    const interval = setInterval(loadDeviceStates, 3000);
    return () => clearInterval(interval);
}, []);
```

#### 2. WebSocket Handler Updates
- **Changed**: `device_state_update` WebSocket messages now trigger database refresh
- **Changed**: `appliance_update` messages also trigger device states refresh
- **Result**: Real-time updates with database consistency verification

```javascript
// Update local state immediately for fast UI response
setDeviceStates(prev => ({ ...prev, [room]: { ...prev[room], [device]: state } }));

// Also refresh from database to ensure consistency
setTimeout(async () => {
    const response = await api.getAllDeviceStates();
    if (response && response.device_states) {
        setDeviceStates(response.device_states);
    }
}, 100);
```

#### 3. Drawer Component (`docker/services/dashboard/src/components/Drawer.jsx`)
- **Changed**: Now uses `deviceStates` from context as source of truth
- **Keeps**: `appliances` for metadata (name, type, id, etc.)
- **Result**: Device state display always reflects database state

```javascript
// Get device state from database (source of truth)
const deviceState = deviceStates[normalizedRoom]?.[app.type] ?? app.state;
const isOn = deviceState === true || deviceState === 1;
```

## Benefits

1. **Single Source of Truth**: `device_states` table is authoritative
2. **Consistency**: All updates go through the same path
3. **Reliability**: Database state is always correct, even if WebSocket fails
4. **Simplified Logic**: Less complex sync code between multiple sources
5. **Real-time Updates**: WebSocket still provides instant UI updates
6. **Fallback Support**: REST polling ensures state is fresh even without WebSocket

## Data Flow

### Device Control Flow (LLM or User)
```
1. User/LLM triggers device control
   ↓
2. Backend updates device_states table (source of truth)
   ↓
3. Backend syncs to appliances table (backward compatibility)
   ↓
4. Backend broadcasts WebSocket message
   ↓
5. Frontend receives WebSocket, updates local state immediately
   ↓
6. Frontend refreshes from database (100ms delay) for consistency
```

### UI Display Flow
```
1. Component renders
   ↓
2. Reads deviceStates from React context
   ↓
3. deviceStates populated from database (via API or WebSocket refresh)
   ↓
4. Uses appliances for metadata (name, type, icon)
   ↓
5. Displays device state from deviceStates (source of truth)
```

## API Endpoints

### `/api/device-states` (GET)
- Returns all device states organized by room
- Format: `{ "device_states": { "room": { "device": state } } }`
- Used by frontend to load initial state and refresh

### `/api/device-states/{room}/{device}` (GET)
- Returns state for specific room/device
- Used for individual device queries

### `/api/device-states/{room}/{device}` (PUT)
- Updates device state
- Updates `device_states` table first, then syncs to `appliances`

## Migration Notes

- **Backward Compatible**: Existing `appliances` table still works
- **No Breaking Changes**: All existing endpoints continue to function
- **Gradual Migration**: Components can be updated one at a time
- **Database Sync**: Both tables stay in sync automatically

## Future Improvements

1. **Remove appliances table dependency**: Once all components use `deviceStates`, we can deprecate `appliances` state field
2. **Optimize polling**: Reduce polling frequency or use WebSocket-only updates
3. **Add caching**: Cache device states in frontend with TTL
4. **Batch updates**: Batch multiple device state updates for better performance

