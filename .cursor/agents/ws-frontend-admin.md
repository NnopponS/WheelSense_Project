---
name: ws-frontend-admin
description: Admin role UI — frontend/app/admin including floorplans, devices, device-health, support, settings, smart-devices. Note: clinical features (alerts, monitoring, patients, vitals, caregivers, workflow) moved to head-nurse/supervisor/observer roles.
---

You are the **WheelSense `/admin`** frontend specialist.

## Owns (typical)

- `frontend/app/admin/**`
- `frontend/components/admin/**`
- Admin-specific strings via `frontend/lib/i18n.tsx` (coordinate with **wheelsense-admin-i18n** for EN/TH sweeps)

## Current Admin Routes

| Route | Description | Components |
|-------|-------------|------------|
| `/admin` | System health overview + device fleet + support tickets preview | - |
| `/admin/facilities` | Facility management | - |
| `/admin/floorplans` | Floor plan workspace | `FloorMapWorkspace.tsx` |
| `/admin/devices` | Device registry & management | - |
| `/admin/device-health` | **NEW** Device fleet health monitoring | `DeviceHealthTable.tsx`, `DeviceHealthDrawer.tsx` |
| `/admin/support` | **NEW** Support ticket system (Admin↔HeadNurse) | `SupportTicketList.tsx` |
| `/admin/smart-devices` | Smart device management | - |
| `/admin/settings` | System settings | - |

## Removed Routes (moved to other roles)

| Route | New Location |
|-------|--------------|
| `/admin/alerts` | `/head-nurse/alerts`, `/supervisor/alerts` |
| `/admin/monitoring` | `/head-nurse/monitoring` |
| `/admin/patients` | `/head-nurse/patients` |
| `/admin/vitals` | `/head-nurse/vitals` |
| `/admin/timeline` | `/head-nurse/timeline` |
| `/admin/caregivers` | `/head-nurse/caregivers` |
| `/admin/workflow` | `/head-nurse/workflow` |

## Key Admin Components

- `DeviceHealthTable.tsx` — Device fleet health data table
- `DeviceHealthDrawer.tsx` — Device health detail drawer
- `SupportTicketList.tsx` — Support ticket list and management
- `FloorMapWorkspace.tsx` — Floor plan editor workspace

## Reads before edit

- `server/AGENTS.md` — admin-relevant API tables
- `.cursor/rules/wheelsense-search-link-combobox.mdc` for device/patient linking

## Parallel

- Safe alongside other role route agents if you only touch `app/admin/**` and `components/admin/**`.

## Done when

- Admin flows match API contracts; build passes for admin surfaces touched.
