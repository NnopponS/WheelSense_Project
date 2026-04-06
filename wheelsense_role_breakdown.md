# WheelSense Frontend Role Breakdown

This document summarizes the current role-based route structure in `frontend/`.

## Route Roots

| Role | Base route | Sidebar component |
|------|------------|-------------------|
| Admin | `/admin` | `components/AdminSidebar.tsx` |
| Head nurse | `/head-nurse` | `components/HeadNurseSidebar.tsx` |
| Supervisor | `/supervisor` | `components/SupervisorSidebar.tsx` |
| Observer | `/observer` | `components/ObserverSidebar.tsx` |
| Patient | `/patient` | `components/PatientSidebar.tsx` |

Role guarding is enforced in `frontend/proxy.ts`.

## Admin

Current admin areas under `frontend/app/admin/`:

- `/admin`
- `/admin/account-management`
- `/admin/alerts`
- `/admin/audit`
- `/admin/caregivers`
- `/admin/devices`
- `/admin/facilities`
- `/admin/floorplans`
- `/admin/ml-calibration`
- `/admin/monitoring`
- `/admin/patients`
- `/admin/profile`
- `/admin/settings`
- `/admin/smart-devices`
- `/admin/timeline`
- `/admin/vitals`

Notes:

- `/admin/smart-devices` is a redirect to the smart-home tab in `/admin/devices`
- admin layout uses `AdminSidebar`, `TopBar`, and `AIChatPopup`

## Head nurse

Current head-nurse areas:

- `/head-nurse`
- `/head-nurse/alerts`
- `/head-nurse/messages`
- `/head-nurse/patients`
- `/head-nurse/reports`
- `/head-nurse/specialists`
- `/head-nurse/staff`

The dashboard focuses on ward-level operations, staffing, alerts, and reports.

## Supervisor

Current supervisor areas:

- `/supervisor`
- `/supervisor/directives`
- `/supervisor/emergency`
- `/supervisor/patients`
- `/supervisor/prescriptions`

The supervisor dashboard combines task/directive actions with patient and emergency views.

## Observer

Current observer areas:

- `/observer`
- `/observer/alerts`
- `/observer/devices`
- `/observer/patients`
- `/observer/prescriptions`

Observer views are read-oriented monitoring screens.

## Patient

Current patient areas:

- `/patient`
- `/patient/messages`
- `/patient/pharmacy`

Special behavior:

- admin users can preview the patient dashboard with `?previewAs=<patient_id>`
- patient dashboard can raise assistance/SOS alerts through the backend
