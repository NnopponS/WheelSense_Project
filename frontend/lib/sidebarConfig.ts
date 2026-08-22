/**
 * Sidebar navigation configuration - Single source of truth for all role navigation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bug,
  ClipboardEdit,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Monitor,
  Pill,
  ShieldAlert,
  Settings,
  Tablet,
  Users,
} from "lucide-react";
import type { Capability } from "./permissions";
import type { TranslationKey } from "./i18n";
import { canonicalizeRole } from "./roles";

export interface NavItem {
  /** Translation key for the label */
  key: TranslationKey;
  /** Route href */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Optional capability required to see this item */
  requiredCapability?: Capability;
  /** Optional badge count key (for dynamic badges) */
  badge?: "alerts" | "tasks" | "messages" | "devices";
  /** Additional path prefixes that should mark this nav item as active */
  activeForPaths?: string[];
  /**
   * When pathname matches this item's href base (no query), require this query param
   * (e.g. hub tab on `/patient?tab=support`).
   */
  activeWhenQueryMatch?: { param: string; value: string };
  /**
   * When pathname matches the role root exactly, suppress active if query param matches
   * (e.g. patient dashboard vs Support both use `/patient`).
   */
  inactiveWhenQueryMatch?: { param: string; value: string };
  /**
   * Sidebar tier. Defaults to "primary". Items tagged "more" render inside the
   * collapsible "More" group (see 2026-04-20 UX redesign). Use this to demote
   * rarely-used surfaces without deleting them.
   */
  group?: "primary" | "more";
  /** Explicit role-specific ordering for the mobile bottom task bar. */
  mobilePriority?: number;
}

export interface NavGroup {
  /** Translation key for category label (optional - if not provided, items are rendered without category) */
  categoryKey?: TranslationKey;
  /** Navigation items in this group */
  items: NavItem[];
}

export type RoleNavConfig = NavGroup[];

type SearchParamsLike = { get(key: string): string | null };

export function isNavItemActive(
  item: NavItem,
  pathname: string,
  searchParams: SearchParamsLike,
  role?: string,
): boolean {
  if (item.activeForPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }
  const base = item.href.split("?")[0];
  if (item.activeWhenQueryMatch) {
    const { param, value } = item.activeWhenQueryMatch;
    return (
      (pathname === base || pathname.startsWith(`${base}/`)) &&
      searchParams.get(param) === value
    );
  }
  const rolePath = role?.replaceAll("_", "-") ?? "";
  const isRoleRoot = base === `/${rolePath}` || (role === "admin" && base === "/admin");
  if (isRoleRoot) {
    if (item.inactiveWhenQueryMatch && pathname === base) {
      const { param, value } = item.inactiveWhenQueryMatch;
      if (searchParams.get(param) === value) return false;
    }
    return pathname === base;
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Role-based navigation configurations
 * Each role has its own set of navigation groups and items
 */
export const ROLE_NAV_CONFIGS: Record<string, RoleNavConfig> = {
  /** Admin role — Blueprint: System Overview, People, Facilities, Devices, Operations, System */
  admin: [
    {
      items: [
        {
          key: "nav.admin.overview",
          href: "/admin",
          icon: LayoutDashboard,
        },
        {
          key: "nav.admin.people",
          href: "/admin/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/admin/caregivers", "/admin/patients", "/admin/account-management", "/admin/users"],
        },
        {
          key: "nav.admin.facilities",
          href: "/admin/facility-management",
          icon: MapPin,
          requiredCapability: "facilities.read",
          activeForPaths: ["/admin/floorplans", "/admin/facilities"],
        },
        {
          key: "nav.admin.devices",
          href: "/admin/devices",
          icon: Tablet,
          requiredCapability: "devices.read",
          activeForPaths: ["/admin/smart-devices", "/admin/device-health"],
        },
        {
          key: "nav.admin.operations",
          href: "/admin/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: ["/admin/workflow", "/admin/shift-checklists", "/admin/timeline", "/admin/messages", "/admin/demo-control", "/admin/support", "/admin/alerts"],
        },
        {
          key: "nav.admin.system",
          href: "/admin/settings",
          icon: Settings,
          activeForPaths: ["/admin/audit", "/admin/audit-log", "/admin/ml-calibration", "/admin/profile"],
          group: "more",
        },
      ],
    },
  ],

  /** Head Caregiver role — Blueprint: Queue, Patients, Tasks, Messages, More */
  head_caregiver: [
    {
      items: [
        {
          key: "nav.headNurse.queue",
          href: "/head-caregiver",
          icon: LayoutDashboard,
          badge: "alerts",
          mobilePriority: 1,
        },
        {
          key: "nav.headNurse.emergency",
          href: "/head-caregiver/emergency",
          icon: ShieldAlert,
          badge: "alerts",
          mobilePriority: 5,
        },
        {
          key: "nav.headNurse.patients",
          href: "/head-caregiver/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/head-caregiver/prescriptions"],
          mobilePriority: 3,
        },
        {
          key: "nav.headNurse.caregivers",
          href: "/head-caregiver/caregivers",
          icon: Users,
          requiredCapability: "caregivers.read",
          mobilePriority: 4,
        },
        {
          key: "nav.headNurse.tasks",
          href: "/head-caregiver/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/head-caregiver/workflow",
            "/head-caregiver/calendar",
            "/head-caregiver/directives",
          ],
          mobilePriority: 2,
        },
        {
          key: "nav.headNurse.messages",
          href: "/head-caregiver/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          mobilePriority: 4,
        },
        { key: "nav.headNurse.map", href: "/head-caregiver/floorplans", icon: MapPin, group: "more", activeForPaths: ["/head-caregiver/monitoring"] },
        { key: "nav.headNurse.support", href: "/head-caregiver/support", icon: Bug, group: "more" },
        { key: "nav.headNurse.account", href: "/head-caregiver/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  // Legacy aliases — canonicalized at runtime via canonicalizeRole
  head_nurse: [],
  supervisor: [],

  /** Caregiver role — Blueprint: Today, Patients, Alerts, Handover, More */
  caregiver: [
    {
      items: [
        {
          key: "nav.observer.today",
          href: "/caregiver",
          icon: LayoutDashboard,
          mobilePriority: 1,
        },
        {
          key: "nav.observer.tasks",
          href: "/caregiver/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          mobilePriority: 2,
        },
        {
          key: "nav.observer.patients",
          href: "/caregiver/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/caregiver/prescriptions"],
          mobilePriority: 4,
        },
        {
          key: "nav.observer.alerts",
          href: "/caregiver/alerts",
          icon: Bell,
          badge: "alerts",
          mobilePriority: 3,
        },
        {
          key: "nav.observer.handover",
          href: "/caregiver/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          mobilePriority: 5,
        },
        { key: "nav.observer.support", href: "/caregiver/support", icon: Bug, group: "more" },
        { key: "nav.observer.map", href: "/caregiver/floorplans", icon: MapPin, group: "more", activeForPaths: ["/caregiver/monitoring"] },
        { key: "nav.observer.account", href: "/caregiver/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  // Legacy alias — canonicalized at runtime
  observer: [],

  /** Patient role — Blueprint: Home, Schedule, Medicine, Messages, Room */
  patient: [
    {
      items: [
        {
          key: "nav.patient.home",
          href: "/patient",
          icon: LayoutDashboard,
          inactiveWhenQueryMatch: { param: "tab", value: "support" },
          mobilePriority: 1,
        },
        {
          key: "nav.patient.schedule",
          href: "/patient/schedule",
          icon: HeartPulse,
          activeForPaths: ["/patient/services"],
          mobilePriority: 2,
        },
        {
          key: "nav.patient.medicine",
          href: "/patient/pharmacy",
          icon: Pill,
          mobilePriority: 3,
        },
        {
          key: "nav.patient.messages",
          href: "/patient/messages",
          icon: MessageSquare,
          mobilePriority: 4,
        },
        {
          key: "nav.patient.room",
          href: "/patient/room-controls",
          icon: Monitor,
          mobilePriority: 5,
        },
        {
          key: "nav.patient.support",
          href: "/patient?tab=support",
          icon: Bug,
          activeWhenQueryMatch: { param: "tab", value: "support" },
          group: "more",
        },
        {
          key: "nav.patient.account",
          href: "/patient/settings",
          icon: Settings,
          activeForPaths: ["/account"],
          group: "more",
        },
      ],
    },
  ],
};

/**
 * Get navigation configuration for a specific role
 */
export function getNavConfig(role: string): RoleNavConfig {
  return ROLE_NAV_CONFIGS[canonicalizeRole(role)] ?? [];
}

/**
 * Filter navigation items based on user capabilities
 */
export function filterNavItemsByCapability(
  config: RoleNavConfig,
  hasCapabilityFn: (capability: Capability) => boolean,
): RoleNavConfig {
  return config
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.requiredCapability || hasCapabilityFn(item.requiredCapability),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Split items inside every nav group into primary vs "more" buckets based on
 * `NavItem.group`. Used by `RoleSidebar` to render primary items inline and
 * wrap "more" items behind a collapsible disclosure.
 */
export function partitionNavByGroup(config: RoleNavConfig): {
  primary: RoleNavConfig;
  more: NavItem[];
} {
  const primary: RoleNavConfig = [];
  const more: NavItem[] = [];
  for (const group of config) {
    const primaryItems = group.items.filter((item) => (item.group ?? "primary") === "primary");
    const moreItems = group.items.filter((item) => item.group === "more");
    if (primaryItems.length > 0) {
      primary.push({ ...group, items: primaryItems });
    }
    more.push(...moreItems);
  }
  return { primary, more };
}
