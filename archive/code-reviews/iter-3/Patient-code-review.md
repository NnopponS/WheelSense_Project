# Patient Module — Iteration 3 Audit Report

> **Scope:** `frontend/app/patient/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`

---

## Resolution (superseded / corrected)

| Original finding | Correct architecture |
|------------------|---------------------|
| “Lacks MQTT backend hook” / UI must drive MQTT | Patient **must not** talk to MQTT from the browser. [`/patient/room-controls`](../../frontend/app/patient/room-controls/page.tsx) calls **`api.listSmartDevices` / `api.controlSmartDevice`** → FastAPI **`/api/ha/*`** ([`homeassistant.py`](../../server/app/api/endpoints/homeassistant.py)) which integrates Home Assistant. That is the supported control path today. |
| Proposed `/api/care/device/action` | **Rejected as stated:** room/smart-device control is not under the `care` medication/specialist domain. Native (non-HA) room actuators are **proposed** in [ADR-0012](../../docs/adr/0012-room-native-actuators-mqtt.md), not `/api/care/...`. |

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### ✅ Patient Payload Routing
The backend isolates queries based on the token's `workspace_id` and strict `RequireRole(["patient"])`. 
During our Iteration 3 check, all routes originating from the Patient shell perfectly respect the `@wheelsense` canonical domains:
- Pharmacy pulls correctly from `/api/medication/*`
- Services pull correctly from `/api/care/*` (Resolved in Iteration 2)

### ⚠️ Pending Hardware Integration (Room Controls)
The `/patient/room-controls` page is fully rendered but lacks an MQTT backend hook. 
Per the `@wheelsense` backend architectural notes in `.agents/workflows/wheelsense.md`, the ingestion flow dictates the frontend should not deal with MQTT directly. Instead, UI interactions should trigger REST calls to the python backend, which then resolves the device registry and publishes the MQTT topic. 
*Status: This connection has not yet been built.*

---

## 2. Aesthetic & Presentation (`@frontend-design`)

### ⚠️ Lack of Emotional Nuance (DFII Score: 5/15)
The Patient portal should feel vastly different from the Admin portal.
Currently, it uses the exact same typography, padding, and neutral color tones as the Admin dashboard. 
- **Recommendation (Organic/Natural Aesthetic):** For a hospitalized patient, the UI should evoke calm, utilizing a *Soft Luxury* or *Organic Natural* aesthetic. We should introduce smooth gradients, rounded typography (e.g., 'Outfit' instead of standard Inter), and high-contrast massive touch targets (since patients may be using tablets with restricted mobility).

---

## 3. Skill & Action Routing (`@skill-router`)

**✅ Primary Skill: `@backend-architect` & `@python-patterns`**
*Why:* To finalize the backend bridging. A backend architect needs to design the `/api/care/device/action` endpoint that will accept REST commands from the `room-controls` UI and correctly marshal them into Python MQTT publishes targeting specific bed/room hardware.

**🔁 Also consider:**
- `@frontend-design` — To completely re-skin `app/patient/layout.tsx` and override variables to shift the patient-facing interface away from the sterile default ShadCN look, explicitly employing the "Soft Organic" stylistic mandate.
