import type { User } from "@/lib/types";

export type AppRole = User["role"];

export type Capability =
  | "users.manage"
  | "patients.manage"
  | "patients.read"
  | "caregivers.manage"
  | "caregivers.schedule.manage"
  | "caregivers.read"
  | "devices.manage"
  | "devices.read"
  | "alerts.manage"
  | "alerts.read"
  | "messages.manage"
  | "reports.manage"
  | "reports.read"
  | "facilities.manage"
  | "facilities.read"
  | "self.read";

const ROLE_CAPABILITIES: Record<AppRole, Set<Capability>> = {
  admin: new Set<Capability>([
    "users.manage",
    "patients.manage",
    "patients.read",
    "caregivers.manage",
    "caregivers.schedule.manage",
    "caregivers.read",
    "devices.manage",
    "devices.read",
    "alerts.manage",
    "alerts.read",
    "messages.manage",
    "reports.manage",
    "reports.read",
    "facilities.manage",
    "facilities.read",
    "self.read",
  ]),
  head_nurse: new Set<Capability>([
    "users.manage",
    "patients.manage",
    "patients.read",
    "caregivers.manage",
    "caregivers.schedule.manage",
    "caregivers.read",
    "devices.manage",
    "devices.read",
    "alerts.manage",
    "alerts.read",
    "messages.manage",
    "reports.manage",
    "reports.read",
    "facilities.read",
    "self.read",
  ]),
  supervisor: new Set<Capability>([
    "patients.read",
    "caregivers.read",
    "devices.read",
    "alerts.manage",
    "alerts.read",
    "messages.manage",
    "reports.read",
    "facilities.read",
    "self.read",
  ]),
  observer: new Set<Capability>([
    "patients.read",
    "devices.read",
    "alerts.read",
    "messages.manage",
    "self.read",
  ]),
  patient: new Set<Capability>(["alerts.read", "messages.manage", "self.read"]),
};

const APP_ROUTE_ROLES = {
  "/admin": new Set<AppRole>(["admin"]),
  "/head-nurse": new Set<AppRole>(["admin", "head_nurse"]),
  "/supervisor": new Set<AppRole>(["admin", "supervisor"]),
  "/observer": new Set<AppRole>(["admin", "observer"]),
  "/patient": new Set<AppRole>(["admin", "patient"]),
} as const;

export function hasCapability(role: AppRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function canAccessAppRole(role: AppRole, appRoot: keyof typeof APP_ROUTE_ROLES): boolean {
  return APP_ROUTE_ROLES[appRoot].has(role);
}

