# Changelog

All notable changes to the WheelSense project will be documented in this file.

## [2.0.0] - 2025-10-23

### 🎯 COMPLETE SYSTEM RESTRUCTURE

Major breaking changes to align entire system with ESP32 data format.

### ✨ Added

**Database:**
- `sensor_history` table for time-series data archiving
- `system_events` table for event logging
- Database views for common queries (`v_current_sensors`, `v_online_devices`, etc.)
- Triggers for automatic history archiving
- Optimized indexes for better performance

**API:**
- SSE (Server-Sent Events) endpoint at `/api/events`
- System statistics endpoint `/api/stats`
- Device history endpoint `/api/sensor-data/:node/:wheel/history`
- Health check endpoint `/health`
- PostgreSQL LISTEN/NOTIFY integration
- Real-time data broadcasting

**Frontend:**
- SSE client implementation
- Real-time connection indicators
- Auto-reconnect logic
- Connection status tracking
- Improved error handling

**Documentation:**
- Comprehensive `README.md`
- `MIGRATION_GUIDE.md` for upgrading from v1.0
- `RESTRUCTURE_SUMMARY.md` overview
- API endpoint documentation
- ESP32 data format specification

**Infrastructure:**
- Docker health checks for all services
- Service dependency management
- Log rotation configuration
- Better environment variable documentation

### 🔄 Changed

**Database Schema:**
- `node_id` → `node` (everywhere)
- `wheel_id` → `wheel` (everywhere)
- `room_id` → `node` (in map_layout)
- `room_name` → `node_name` (in map_layout)
- Consistent naming throughout all tables

**MQTT Collector:**
- Complete rewrite to match ESP32 format
- Improved data validation
- Better type conversion (safeInteger, safeFloat, safeBoolean)
- Enhanced error handling
- Processing time logging

**REST API:**
- Complete rewrite with new endpoints
- Consistent field naming (node, wheel)
- SSE implementation
- Better error responses
- Request logging

**Frontend:**
- Updated all components to use new field names
- TypeScript interfaces aligned with backend
- Improved type safety
- Better error handling

**Terminology:**
- Consistent use of "Node" instead of mixed "Room/Node"
- All labels: `node_label` instead of `room_name`
- Clear distinction between node (physical location) and wheel (wheelchair)

### 🐛 Fixed

- **Active Wheelchairs Count**: Now counts online devices (not just moving ones)
- **MQTT Logs**: Now stream in real-time instead of replacing
- **Map Layout**: Now uses correct `node` field
- **Field Mapping**: All fields match ESP32 output exactly
- **Type Conversions**: Proper handling of NULL values
- **Real-time Updates**: SSE working correctly
- **Stats Calculation**: Using correct fields

### 🗑️ Removed

- Inconsistent `node_id` references
- Mixed `room_id` and `node_id` usage
- Hardcoded field mappings
- Legacy data transformation code

### 📝 Migration Path

See `MIGRATION_GUIDE.md` for detailed migration instructions.

**Breaking Changes:**
- All API responses now use `node` and `wheel` instead of `node_id` and `wheel_id`
- Map layout API uses `node` and `node_name` instead of `room_id` and `room_name`
- Database schema has changed significantly
- Frontend interfaces updated

---

## [1.0.0] - 2025-10-XX

### Initial Release

**Features:**
- MQTT data collection
- PostgreSQL storage
- REST API
- React dashboard
- Basic map visualization
- Device labeling

**Known Issues:**
- Inconsistent field naming (node_id vs node)
- Mixed terminology (Room vs Node)
- Stats calculation issues
- MQTT logs not streaming properly

---

## Version History

| Version | Date | Status | Description |
|---------|------|--------|-------------|
| 2.0.0 | 2025-10-23 | ✅ Current | Complete restructure |
| 1.0.0 | 2025-10-XX | ⚠️ Deprecated | Initial release |

---

## Upgrade Paths

### From v1.0 to v2.0

**Required:**
1. Database schema migration
2. Frontend code updates
3. API client updates

**Optional:**
4. Data migration (if preserving history)

**Time estimate:**
- Fresh install: 10 minutes
- Full migration: 30-60 minutes

See `MIGRATION_GUIDE.md` for details.

---

## Deprecation Notice

### v1.0 Field Names (Deprecated)

❌ **Do not use:**
- `node_id` → Use `node`
- `wheel_id` → Use `wheel`
- `room_id` → Use `node`
- `room_name` → Use `node_name`

### v1.0 API Endpoints (Changed)

| Old (v1.0) | New (v2.0) | Status |
|------------|------------|--------|
| Response field: `node_id` | `node` | ✅ Changed |
| Response field: `wheel_id` | `wheel` | ✅ Changed |
| `/api/map-layout` field: `room_id` | `node` | ✅ Changed |
| `/api/map-layout` field: `room_name` | `node_name` | ✅ Changed |

---

## Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):
- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality
- PATCH version for backwards-compatible bug fixes

**v2.0.0** is a MAJOR version due to breaking API changes.

---

## Contributors

- AI Assistant - Complete system restructure
- Original development team - v1.0 foundation

---

## License

Proprietary - WheelSense Project

---

**Last Updated:** October 23, 2025

