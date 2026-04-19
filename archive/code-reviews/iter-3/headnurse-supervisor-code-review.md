# Supervisor & Head Nurse Modules — Iteration 3 Audit

> **Scope:** `frontend/app/supervisor/*` & `frontend/app/head-nurse/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`

---

## Resolution (implementation tracking)

| Original finding | Status |
|------------------|--------|
| i18n hardcode in data tables (supervisor + head nurse) | **Addressed in repo follow-up:** table headers, placeholders, and fixed UI strings moved to [`frontend/lib/i18n.tsx`](../../frontend/lib/i18n.tsx) with `headNurse.*` / `supervisor.*` (or shared `patients.*`) keys as appropriate. |
| High-density “Bloomberg” head nurse layout | **Out of scope** for the iter-3 fix wave; requires separate product/ADR — only incremental density where explicitly planned. |

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### ✅ Data Integrity
Both modules behave flawlessly according to the backend-architectural rules regarding `workspace_id`. 
The Supervisor analytics correctly pull rolled-up data restricted exclusively to `get_current_user_workspace()`.
The Head Nurse workflow perfectly updates the `/api/care/` state without leaking data to sibling workspaces.

### ⚠️ i18n Hardcode Violations
Despite structural soundness, the translation maps (i18n) across both modules are missing key entries. The `@wheelsense` rule requires utilizing `.cursor/agents/wheelsense-admin-i18n.md` when bulk-adding strings, but recent UI iterations have injected raw English strings deep into standard Data Tables inside `supervisor/analytics` and `head-nurse/assignment`.

---

## 2. Aesthetic & Presentation (`@frontend-design`)

### 🟡 Functional but Mundane
The Head Nurse dashboard operates essentially as an Air Traffic Control center. 
- **Aesthetic Opportunity:** *Editorial Brutalism / Dashboard Maximalism*. 
The current interface hides too much data behind tabs or pagination. A Head Nurse needs high-density information. Breaking the standard grid to introduce a dense, multi-pane "Bloomberg Terminal" style layout for patient vitals would massively upgrade situational awareness.

---

## 3. Skill & Action Routing (`@skill-router`)

**✅ Primary Skill: `@language-specialist` (or manual i18n synchronization)**
*Why:* To execute a complete sweep of `frontend/app/supervisor` and `frontend/app/head-nurse` extracting hardcoded table headers and alert titles into the `en/th` locale JSONs, running `npm run build` afterward to update the translation keys schema.

**🔁 Also consider:**
- `@frontend-design` — To rethink the Head Nurse Dashboard into a high-density control center, stripping away whitespace to allow monitoring of 20+ patients simultaneously on a single widescreen mount.
