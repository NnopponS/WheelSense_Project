# Observer Module — Iteration 3 Audit Report

> **Scope:** `frontend/app/observer/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`

---

## Resolution (superseded / updated — do not re-open without re-verification)

| Original finding | Repo truth (post–iter-3 plan) |
|------------------|-------------------------------|
| Sidebar “orphaned” `/observer/devices`, `/observer/prescriptions`, `/observer/monitoring` | These routes are present under `observer` in [`frontend/lib/sidebarConfig.ts`](../../frontend/lib/sidebarConfig.ts) with appropriate `requiredCapability` where applicable. If a user still does not see an item, verify role capabilities and rebuild the web image. |
| Missing toast / global provider | **Sonner** is wired in `AppProviders`; [`useNotifications`](../../frontend/hooks/useNotifications.ts) polls alerts (10s), shows toasts for new active alerts (severity-gated), and TopBar offers optional alert sound. Further “alert maximalist” styling is optional UX polish, not a missing provider. |

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### ✅ Exceptional Compliance
Unlike the Admin module, the Observer module (specifically `/observer/tasks/page.tsx` and patient details) was refactored in Iteration 2 and **complies perfectly** with the `@wheelsense` mandate. It uses `@tanstack/react-query` natively, effectively managing cache invalidations across workspace boundaries.

### ⚠️ UX Workflow Disconnect
The `@wheelsense` workflow prioritizes explicit routing and roles. However, the `frontend/lib/sidebarConfig.ts` is currently failing the Observer module. Critical canonical routes exist but are entirely orphaned from the navigation menu:
- `/observer/devices`
- `/observer/prescriptions`
- `/observer/monitoring`

**Backend Note:** Patient-bound device checks (`GET /api/devices`) are strictly separated by workspace per `@wheelsense` rules, and the observer API client requests it correctly.

---

## 2. Aesthetic & Presentation (`@frontend-design`)

### ⚠️ Missing Push Notifications (Real-Time UX)
The data layer correctly syncs alerts via polling/WebSockets, but the UI fails to surface these aggressively. 
For an observer (nurse), the design aesthetic should be *Functional Assurance*. If an SOS alert fires, relying on a small red dot in the dashboard isn't enough. We need aggressive, high-contrast Toast notifications that break the grid to grab attention immediately.

---

## 3. Skill & Action Routing (`@skill-router`)

**✅ Primary Skill: `@senior-fullstack`**
*Why:* Needs to modify `sidebarConfig.ts` to reinstate the missing navigation routes for the Observer. This is a quick configuration fix but massively impacts usability.

**🔁 Also consider:**
- `@frontend-design` — To design and implement a global robust Notification/Toast provider (`sonner` or `react-hot-toast`) styled in an *Alert Maximalist* aesthetic (vibrant reds/yellows with high contrast shadow depth) exclusively for SOS intercepts.
