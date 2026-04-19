# Full-Stack Audit Report — Iteration 5 (UI/UX & Workflow Ideal)

> **Scope:** `frontend/app/*` & `server/app/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`, `@skill-router`

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### ✅ Backend Endpoint Autonomy
The API backend (`server/app/api/endpoints/`) is rock-solid. All 30 active router modules accurately invoke `get_current_user_workspace`, effectively eliminating horizontal data leaks between hospitals/clinics. 
- *Integration note:* The separation of `/api/ha/*` (Actuators/HomeAssistant for room controls) and `/api/care/*` (clinical applications) perfectly follows the `ADR-0012` blueprint.

### 🚫 Frontend Technical Debt (Legacy Hooks)
The system continues to accrue technical debt in the frontend `admin/*` directories by relying heavily on the old `hooks/useQuery`. Switching to native `@tanstack/react-query` must happen before the next feature freeze to ensure proper cache invalidation.

---

## 2. Ideal UI/UX & User-Workflow Targets (`@frontend-design`)

*In this iteration, we focus heavily on the optimal User Experience (UX) and how each persona should "feel" and interact with the platform natively, while keeping our underlying aesthetic themes.*

### A. The Patient Workflow (Theme: *Soft Organic / Luxury Recovery*)
**Ideal Workflow:** For a hospitalized patient dealing with mobility challenges (e.g., using a tablet mounted to a bedside or wheelchair), the UI must present zero friction.
- **Interactions:** The layout must abandon small nested menus. We need massive, high-contrast touch areas.
- **Workflow:** When the patient opens the `/patient` dashboard, the primary actions (Room Lights ✅, Nurse Call 🚨, Bed Adjustments 🛏️) must be single-tap operations.
- **UX Goal:** The interface should feel calming, fluid, and completely predictable, devoid of data grids. Use soft gradients and rounded radii.

### B. The Observer (Nurse / Caregiver) Workflow (Theme: *Functional Assurance & Alert Maximalist*)
**Ideal Workflow:** Caregivers are usually mobile (using phones or walking between stations). Their workflow is reactive. 
- **Interactions:** Data is secondary to alerts. The dashboard `/observer/tasks` should prioritize active incidents sorted by severity. 
- **Workflow:** If a wheelchair sensors detects a sudden tilt or fall, the system must trigger a global **Toast Notification** that violently breaks the standard design grid (High contrast Red/Yellow shadows) to demand immediate attention. 
- **UX Goal:** Confidence. The app should feel entirely silent when everything is okay, and overwhelmingly persistent when someone needs help.

### C. The Head Nurse / Supervisor Workflow (Theme: *Dashboard Maximalism / Editorial Brutalism*)
**Ideal Workflow:** The Head Nurse runs an "Air Traffic Control" station on a large widescreen monitor at the ward counter.
- **Interactions:** Stop hiding critical data behind paginated ShadCN tables. We need high-density data visualization.
- **Workflow:** The `/head-nurse/` and `/supervisor/analytics` dashboards must use multi-pane layouts to show 20+ patients simultaneously. Heart rates, assigned caregivers, and active SOS states must be visible in a single glance without scrolling or clicking into details.
- **UX Goal:** Complete situational awareness. The screen should look like a Bloomberg Terminal—dense, utilitarian, with monospace numbers and tight grid spacing highlighting anomalies instantly.

---

## 3. Recommended Action Plan (`@skill-router`)

**✅ Primary Skill: `@frontend-design` & `@ui-ux-pro-max`**
*Why:* To execute the radical shift in Component layout structures. Instead of blindly passing ShadCN components to all pages, a frontend designer needs to orchestrate contextual layout overrides (e.g., stripping padding in Head Nurse views to achieve maximalism, while doubling padding for Patient views).

**🔁 Also consider:**
- `@backend-architect` — Ensure that the upcoming migration to `@tanstack/react-query` utilizes WebSocket connections properly for sweeping real-time data into the "Alert Maximalist" observer dashboard.
- `@tests-fixing` — Implementing these drastic UX workflow changes will break current end-to-end testing selector logic. Tests must be updated relative to the new DOM density.
