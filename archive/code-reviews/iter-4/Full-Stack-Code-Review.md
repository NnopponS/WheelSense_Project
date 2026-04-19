# Full-Stack Audit Report — Iteration 4

> **Scope:** `frontend/app/*` & `server/app/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`, `@skill-router`

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### 🔄 Correction & Verification: Room Controls (Home Assistant vs MQTT)
In Iteration 3, an architectural violation was flagged incorrectly regarding Patient Room Controls missing a direct MQTT hook or `/api/care/device/action` endpoint. 

**Iter-4 Resolution:** The architecture is actually completely correct as-is based on `ADR-0012` and current blueprints. 
- *Patient must not talk to MQTT from the browser.* 
- Interactions in `frontend/app/patient/room-controls/page.tsx` correctly call `api.listSmartDevices` and `api.controlSmartDevice`, which correctly route to FastAPI's **`/api/ha/*`** (`homeassistant.py`), integrating with Home Assistant securely. This is the supported control path and respects the separation of `care` (medication/specialists) vs `ha` (actuators/room).

### ✅ Backend Endpoint Scope
Scanning `server/app/api/endpoints/`, all 30 sub-routes correctly inject `get_current_user_workspace`. Data boundaries are secure. The backend perfectly fulfills the strict `@wheelsense: Core Rules` around "Protected backend work must scope by `current_user.workspace_id`".

---

## 2. Global Frontend Findings (`@frontend-design`)

While the backend architecture is incredibly stable, the frontend still exhibits areas where technical debt limits UX ambition.

### 🚫 Anti-Pattern Reminder: Legacy Query Hook
The issue from Iteration 3 persists across the Admin application. 
- Pages under `frontend/app/admin/*` are still heavily relying on the deprecated `hooks/useQuery`. 
- `@wheelsense` explicitly mandates: *"TanStack Query directly for actively maintained admin/role pages."*

### ⚠️ Aesthetic Stagnation: The "Generic UI Trap"
Under `@frontend-design` mandates, the current platform UI suffers from layout homogeneity. 
- **Admin & Patient use the exact same visual weight.** A patient struggling with fine motor skills requires massive, high-contrast touch targets ("Soft Organic" aesthetic), whereas a Supervisor analyzing 50 instances of telemetry requires high-density grids ("Editorial Brutalism").
- The current implementation uses uniform ShadCN default paddings across all domains, yielding an average Design Feasibility & Impact Index (DFII) score of 4/15.

---

## 3. Recommended Action Plan (`@skill-router`)

To move from Iter-4 review into active remediation, here is the routing strategy:

**✅ Primary Skill: `@backend-architect` / `@senior-fullstack`**
*Why:* A full-stack engineer needs to sweep the `frontend/app/admin/` tree and systematically swap all legacy `useQuery` bindings to `@tanstack/react-query`. This unblocks advanced optimistic UI caching.

**🔁 Also consider:**
- `@frontend-design` — To fork the `Tailwind` configuration into sub-themes (e.g., `theme-patient`, `theme-headnurse`) and override the base ShadCN `components/ui/*` padding rules selectively depending on the active layout file.
- `@tests-fixing` — Once the TanStack transition occurs, E2E play-wright tests will likely break due to faster render cycles.
