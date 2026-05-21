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
          href: "/admin/personnel",
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

  /** Head Nurse role — Blueprint: Command Center, Alerts, Patients, Staff, Work, Messages, More */
  head_nurse: [
    {
      items: [
        {
          key: "nav.headNurse.commandCenter",
          href: "/head-nurse",
          icon: LayoutDashboard,
          badge: "alerts",
          mobilePriority: 1,
        },
        {
          key: "nav.headNurse.alerts",
          href: "/head-nurse/alerts",
          icon: Bell,
          badge: "alerts",
          mobilePriority: 2,
        },
        {
          key: "nav.headNurse.patients",
          href: "/head-nurse/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/head-nurse/patients"],
          mobilePriority: 3,
        },
        {
          key: "nav.headNurse.staff",
          href: "/head-nurse/staff",
          icon: Users,
          activeForPaths: ["/head-nurse/specialists", "/head-nurse/calendar"],
          mobilePriority: 4,
        },
        {
          key: "nav.headNurse.work",
          href: "/head-nurse/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/head-nurse/workflow",
            "/head-nurse/shift-checklists",
            "/head-nurse/timeline",
            "/head-nurse/reports"
          ],
          mobilePriority: 5,
        },
        {
          key: "nav.headNurse.messages",
          href: "/head-nurse/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          group: "more",
        },
        { key: "nav.headNurse.map", href: "/head-nurse/floorplans", icon: MapPin, group: "more", activeForPaths: ["/head-nurse/monitoring"] },
        { key: "nav.headNurse.support", href: "/head-nurse/support", icon: Bug, group: "more" },
        { key: "nav.headNurse.account", href: "/head-nurse/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  /** Supervisor role — Blueprint: Queue, Patients, Tasks, Messages, More */
  supervisor: [
    {
      items: [
        {
          key: "nav.supervisor.queue",
          href: "/supervisor",
          icon: LayoutDashboard,
          badge: "alerts",
          mobilePriority: 1,
        },
        {
          key: "nav.supervisor.emergency",
          href: "/supervisor/emergency",
          icon: ShieldAlert,
          badge: "alerts",
          mobilePriority: 5,
        },
        {
          key: "nav.supervisor.patients",
          href: "/supervisor/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/supervisor/patients", "/supervisor/prescriptions"],
          mobilePriority: 3,
        },
        {
          key: "nav.supervisor.tasks",
          href: "/supervisor/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/supervisor/workflow",
            "/supervisor/calendar",
            "/supervisor/directives",
          ],
          mobilePriority: 2,
        },
        {
          key: "nav.supervisor.messages",
          href: "/supervisor/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          mobilePriority: 4,
        },
        { key: "nav.supervisor.map", href: "/supervisor/floorplans", icon: MapPin, group: "more", activeForPaths: ["/supervisor/monitoring"] },
        { key: "nav.supervisor.support", href: "/supervisor/support", icon: Bug, group: "more" },
        { key: "nav.supervisor.account", href: "/supervisor/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  /** Observer role — Blueprint: Today, Patients, Alerts, Handover, More */
  observer: [
    {
      items: [
        {
          key: "nav.observer.today",
          href: "/observer",
          icon: LayoutDashboard,
          mobilePriority: 1,
        },
        {
          key: "nav.observer.tasks",
          href: "/observer/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          mobilePriority: 2,
        },
        {
          key: "nav.observer.patients",
          href: "/observer/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/observer/patients", "/observer/prescriptions"],
          mobilePriority: 4,
        },
        {
          key: "nav.observer.alerts",
          href: "/observer/alerts",
          icon: Bell,
          badge: "alerts",
          mobilePriority: 3,
        },
        {
          key: "nav.observer.handover",
          href: "/observer/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          mobilePriority: 5,
        },
        { key: "nav.observer.support", href: "/observer/support", icon: Bug, group: "more" },
        { key: "nav.observer.map", href: "/observer/floorplans", icon: MapPin, group: "more", activeForPaths: ["/observer/monitoring"] },
        { key: "nav.observer.account", href: "/observer/settings", icon: Settings, group: "more" },
      ],
    },
  ],

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
  return ROLE_NAV_CONFIGS[role] ?? [];
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
