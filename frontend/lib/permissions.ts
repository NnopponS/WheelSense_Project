import type { User } from "@/lib/types";
import { canonicalizeRole } from "@/lib/roles";

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
  | "self.read"
  | "workflow.manage"
  | "schedule.manage"
  | "device_health.read";

const OPERATIONAL_LEAD_CAPABILITIES: Capability[] = [
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
  "workflow.manage",
  "schedule.manage",
  "device_health.read",
];

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
    "workflow.manage",
    "schedule.manage",
    "device_health.read",
  ]),
  head_caregiver: new Set(OPERATIONAL_LEAD_CAPABILITIES),
  // Legacy aliases — canonicalized at runtime
  head_nurse: new Set(OPERATIONAL_LEAD_CAPABILITIES),
  supervisor: new Set(OPERATIONAL_LEAD_CAPABILITIES),
  caregiver: new Set<Capability>([
    "patients.read",
    "devices.read",
    "alerts.read",
    "messages.manage",
    "self.read",
    "workflow.manage",
    "schedule.manage",
    "device_health.read",
  ]),
  observer: new Set<Capability>([
    "patients.read",
    "devices.read",
    "alerts.read",
    "messages.manage",
    "self.read",
    "workflow.manage",
    "schedule.manage",
    "device_health.read",
  ]),
  patient: new Set<Capability>(["alerts.read", "messages.manage", "self.read", "schedule.manage"]),
};

const APP_ROUTE_ROLES = {
  "/admin": new Set<AppRole>(["admin"]),
  "/head-caregiver": new Set<AppRole>(["admin", "head_caregiver", "head_nurse", "supervisor"]),
  "/caregiver": new Set<AppRole>(["admin", "caregiver", "observer"]),
  "/patient": new Set<AppRole>(["admin", "patient"]),
} as const;

export function hasCapability(role: AppRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[canonicalizeRole(role) as AppRole].has(capability);
}

export function canAccessAppRole(role: AppRole, appRoot: keyof typeof APP_ROUTE_ROLES): boolean {
  return APP_ROUTE_ROLES[appRoot].has(canonicalizeRole(role) as AppRole);
}
