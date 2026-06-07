---
name: build-web-apps

auto_execution_mode: 0
description: Codex Build Web Apps plugin wrapper for polished frontend apps, React/Next.js, shadcn, Stripe, and Supabase guidance.
---

# /build-web-apps

Use this workflow for frontend builds imported from the Codex `build-web-apps@openai-curated` plugin.

## Workflow

1. **Retrieve Context**: Query MemPalace wing `wheelsense` for frontend design, UI, and architecture context.
2. **Route Skill**: Choose the narrowest plugin skill:
   - `frontend-app-builder` for new visual surfaces, redesigns, dashboards, and polished UI.
   - `frontend-testing-debugging` for browser/runtime UI debugging.
   - `react-best-practices` for React or Next.js implementation quality.
   - `shadcn-best-practices` for shadcn/ui work.
   - `stripe-best-practices` for Stripe integration.
   - `supabase-best-practices` for Supabase/Postgres guidance.
3. **Coordinate With WheelSense**: Use `/implement`, `/tdd`, `/e2e`, or `/security` as appropriate.
4. **Verify**: Prefer frontend type checks, existing scripts, and browser testing.
5. **Record**: Use `/memory-update` when UI architecture, design system, or integration decisions become durable.
