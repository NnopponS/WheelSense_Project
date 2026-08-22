# Ease AI Product Context

## Register
product

## Product Purpose
Ease AI is a smart nursing home operations platform for safer wheelchair patient care. It combines ward monitoring, device telemetry, patient vitals, emergency alerts, staff tasks, care directives, and an EaseAI assistant into role-based web portals.

## Primary Users
- Supervisor: manages ward safety, staffing, floor status, urgent alerts, task assignment, clinical response, care escalation, and prioritization. This canonical role includes the former Head Nurse capabilities except Admin-only operations.
- Observer: works mostly on mobile, handles assigned tasks, patient help requests, emergency acknowledgements, and quick patient lookup.
- Admin: manages users, devices, system health, settings, audit, and support operations.
- Patient: uses a simplified portal for SOS, assistance, schedule, messages, profile, sensors, and health status.

## Key Workflows
- Emergency response must be visible immediately and never buried below long content.
- Staff roles primarily use mobile and need task, emergency, patient lookup, and AI access above the fold.
- Supervisor uses desktop as a command center, with floor plan, urgent queue, staff status, and task table visible together.
- Floor plan behavior must remain stable; it should keep the existing boxed room layout and become visually clearer.
- EaseAI can summarize and propose actions, but mutating actions require an explicit confirm or reject step.
- Patient health analysis should explain risk and monitoring needs without diagnosing disease.

## Product Tone
Professional, calm, concise, operational, and safe. The interface should feel like a clinical command tool used under time pressure, not a marketing dashboard.

## Anti-Patterns
- Oversized one-card-per-function dashboards.
- Nested cards and decorative glass/gradient effects.
- Hidden emergency actions.
- Mobile screens that require long scrolling before tasks or alerts appear.
- AI actions that execute writes without confirmation.
- Diagnosis wording in health analysis.
