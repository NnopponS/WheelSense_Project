# Database Refactoring Documentation

## Overview

This document describes the database refactoring from 25+ tables to a cleaner, more maintainable structure with reduced duplication and simplified fetch patterns.

## Migration Phases

### Phase 1: Preparation (Non-Breaking) ✅

**Status:** Implemented

**Changes:**
1. Added foreign key columns (`room_id`) to `appliances`, `patients`, `wheelchairs`, `devices` tables
2. Created views for derived data:
   - `device_states_view` - Replaces `device_states` table (always current, no sync needed)
   - `current_user_location_view` - Derived from `timeline` table
   - `map_config_view` - Derived from normalized `buildings`, `floors`, `rooms`, `wheelchairs` tables
3. Marked deprecated tables with comments

**Backward Compatibility:**
- Old columns (`room` strings) remain functional
- Old tables remain accessible
- Views are read-only, don't affect existing code

### Phase 2: Unified Tables (Gradual Migration) ✅

**Status:** Implemented

**New Tables Created:**
1. **`events`** - Unified event log (replaces `activityLogs`, `timeline`, `emergencyEvents`)
   - Fields: `id`, `type` (enum: 'activity', 'location_change', 'emergency'), `room_id`, `user_id`, `device_id`, `from_room`, `to_room`, `severity`, `message`, `resolved`, `resolved_at`, `metadata`, `timestamp`
   
2. **`schedule_events`** - Unified schedule (replaces `schedule_items`, `one_time_events`, `daily_schedule_clones`)
   - Fields: `id`, `event_type` (enum: 'recurring', 'one_time', 'modified'), `base_schedule_id`, `date`, `time`, `activity`, `location`, `action`, `is_active`
   
3. **`care_records`** - Unified care management (replaces `routines`, `doctorNotes`)
   - Fields: `id`, `patient_id`, `type` (enum: 'routine', 'note'), `title`, `content`, `scheduled_time`, `completed`, `doctor_name`
   
4. **`notification_settings`** - Unified notifications (replaces `notification_preferences`, `do_not_remind`)
   - Fields: `id`, `type` (enum: 'device_preference', 'reminder_suppression'), `room_id`, `device_id`, `item`, `value`
   
5. **`chat_sessions`** - Unified chat (replaces `chat_history`, `conversation_summaries`)
   - Fields: `id`, `session_id`, `role`, `content`, `content_full`, `is_notification`, `is_preference_update`, `tool_result`, `summary_text`, `key_events`, `last_summarized_turn`
   
6. **`user_context`** - User context for MCP (replaces `user_info`, without `current_location` - derived from events)
   - Fields: `id`, `name_thai`, `name_english`, `condition`, `last_schedule_check_minute`

**Dual-Write Pattern:**
- New unified fetch methods (`get_events_unified`, `save_event_unified`) write to both old and new tables
- Reads from new tables first, fallback to old tables if needed
- Allows gradual migration of API endpoints

### Phase 3: Cleanup (Breaking Changes)

**Status:** Not Yet Implemented

**Planned Actions:**
1. Remove deprecated tables:
   - `device_states` (replaced by `device_states_view`)
   - `mapConfig` (replaced by `map_config_view`)
   - `activityLogs`, `timeline`, `emergencyEvents` (merged into `events`)
   - `schedule_items`, `one_time_events`, `daily_schedule_clones` (merged into `schedule_events`)
   - `routines`, `doctorNotes` (merged into `care_records`)
   - `notification_preferences`, `do_not_remind` (merged into `notification_settings`)
   - `chat_history`, `conversation_summaries` (merged into `chat_sessions`)
   - `user_info` (replaced by `user_context`)

2. Remove MongoDB compatibility layer
3. Remove sync functions (`sync_appliance_to_state`, `sync_location_to_user_info`, etc.)
4. Remove `_id` columns from all tables

### Phase 4: Optimization

**Status:** Not Yet Implemented

**Planned Actions:**
1. Add foreign key constraints with CASCADE deletes
2. Optimize and consolidate indexes
3. Create ER diagram documentation

## Fetch Patterns

### Unified Strategy

1. **Direct SQL for Core Tables**
   - All core tables use direct SQL with `aiosqlite`
   - Standard pattern: `SELECT * FROM {table} WHERE {conditions} ORDER BY {sort} LIMIT {limit}`

2. **Views for Derived Data**
   - `device_states_view` - Always current, no sync needed
   - `map_config_view` - Computed from normalized tables
   - `current_user_location_view` - Latest location from events

3. **Structured Columns Preferred**
   - JSON fields only for flexible metadata, analysis output, tool results
   - Foreign keys (`room_id`, `user_id`) instead of string matching

4. **Single Fetch Functions**
   - One function per table: `get_{table}(filters)`
   - Optional parameters for filtering: `get_events(type=None, room_id=None, user_id=None, limit=100)`

## Backward Compatibility

### During Migration (Phases 1-2)

- Old API endpoints continue to work
- Old tables remain accessible
- Dual-write pattern ensures data consistency
- Views provide read-only access to derived data

### After Migration (Phase 3+)

- Old tables removed
- API endpoints must use new unified tables
- Migration scripts provided for data export/import

## Usage Examples

### Fetching Events (Unified)

```python
# Fetch all activity events
events = await db.get_events_unified(event_type='activity', limit=50)

# Fetch location changes for a user
location_events = await db.get_events_unified(
    event_type='location_change',
    user_id='user123',
    limit=100
)

# Fetch active emergencies
emergencies = await db.get_events_unified(
    event_type='emergency',
    resolved=0
)
```

### Saving Events (Unified)

```python
# Save activity event
await db.save_event_unified({
    'type': 'activity',
    'room_id': 'room_bedroom',
    'user_id': 'user123',
    'metadata': {'appliance': 'light', 'action': 'on'}
})

# Save location change
await db.save_event_unified({
    'type': 'location_change',
    'user_id': 'user123',
    'from_room': 'Bedroom',
    'to_room': 'Living Room',
    'wheelchair_id': 'wc001'
})
```

### Using Views

```python
# Get device states from view (always current)
device_states = await db.get_device_states_from_view()

# Get current user location from view
async with db._db_connection.execute(
    "SELECT current_location FROM current_user_location_view WHERE userId = ?",
    (user_id,)
) as cursor:
    row = await cursor.fetchone()
    location = row['current_location'] if row else None
```

## Migration Checklist

- [x] Phase 1: Add foreign keys and create views
- [x] Phase 2: Create unified tables
- [x] Phase 2: Migrate API endpoints to use unified tables (timeline, emergency, activities, device_states)
- [ ] Phase 2: Migrate historical data to unified tables
- [ ] Phase 2: Migrate schedule endpoints to use schedule_events table
- [ ] Phase 2: Migrate care/routines endpoints to use care_records table
- [ ] Phase 2: Migrate chat endpoints to use chat_sessions table
- [ ] Phase 3: Remove deprecated tables
- [ ] Phase 3: Remove MongoDB compatibility layer
- [ ] Phase 3: Remove sync functions
- [ ] Phase 4: Add foreign key constraints
- [ ] Phase 4: Optimize indexes
- [x] Phase 4: Create documentation

## Notes

- All migrations are non-breaking during Phases 1-2
- Views eliminate need for manual synchronization
- Foreign keys enable proper JOINs and data integrity
- Unified tables reduce code duplication and maintenance burden

