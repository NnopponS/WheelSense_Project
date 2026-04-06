# Phase 2 Device Management Plan - Historical / Planned Work

This file is a planning document, not proof of current implementation.

## Status

- Treat this as roadmap context only.
- Verify the real state of device management against:
  - `server/AGENTS.md`
  - `server/app/api/endpoints/devices.py`
  - `server/app/services/device_management.py`
  - `server/app/mqtt_handler.py`
  - `frontend/app/admin/devices/`

## Planned Themes

The Phase 2 plan grouped future work into:

- snapshot job lifecycle hardening
- fleet-level command/control workflows
- richer device presence and map projection
- related documentation and ops updates

## Current Guidance

If a Phase 2 feature appears in this file but not in runtime code, treat it as not implemented yet.

If a current runtime feature has evolved beyond the wording in this plan, trust the code and canonical docs instead.
