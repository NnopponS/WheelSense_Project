# lib/permissions.ts

- AppRole · type · L4-L4 — type AppRole = User["role"];
- Capability · type · L6-L25 — type Capability = | "users.manage" | "patients.manage" | "patients.read" | "caregivers.manage" | "caregivers.schedule.manage" | "caregivers.read" | "devices.manage" | "devices.read" | "alerts.manage" | "alerts.read" | "messages.manage" | "reports.manage" | "reports.read" | "facilities.manage" | "facilities.read" | "self.read" | "workflow.manage" | "schedule.manage" | "device_health.read";
- hasCapability · function · L93-L95 — function hasCapability(role: AppRole, capability: Capability): boolean
- canAccessAppRole · function · L97-L99 — function canAccessAppRole(role: AppRole, appRoot: keyof typeof APP_ROUTE_ROLES): boolean
