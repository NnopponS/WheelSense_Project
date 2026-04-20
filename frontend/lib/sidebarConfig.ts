/**
 * Sidebar navigation configuration - Single source of truth for all role navigation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  HeartPulse,
  Settings,
  Users,
  MapPin,
  Tablet,
  MessageSquare,
  Bug,
  Inbox,
  ClipboardEdit,
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
  /** Admin role — 6 items (down from 13) */
  admin: [
    {
      items: [
        {
          key: "nav.dashboard",
          href: "/admin",
          icon: LayoutDashboard,
        },
        {
          key: "nav.personnel",
          href: "/admin/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/admin/caregivers", "/admin/patients", "/admin/account-management"],
        },
        {
          key: "nav.devices",
          href: "/admin/devices",
          icon: Tablet,
          requiredCapability: "devices.read",
        },
        {
          key: "nav.facilityManagement",
          href: "/admin/facility-management",
          icon: MapPin,
          requiredCapability: "facilities.read",
        },
        {
          key: "nav.settings",
          href: "/admin/settings",
          icon: Settings,
          activeForPaths: ["/admin/audit", "/admin/ml-calibration"],
        },
        {
          key: "nav.tasks",
          href: "/admin/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/admin/workflow",
            "/admin/shift-checklists",
            "/admin/timeline",
          ],
        },
        {
          key: "nav.messages",
          href: "/admin/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          activeForPaths: ["/admin/support", "/admin/demo-control"],
        },
      ],
    },
  ],

  /** Head Nurse role — 6 items (down from 16) */
  head_nurse: [
    {
      items: [
        {
          key: "nav.dashboard",
          href: "/head-nurse",
          icon: LayoutDashboard,
          badge: "alerts",
          activeForPaths: ["/head-nurse/floorplans", "/head-nurse/alerts", "/head-nurse/reports"],
        },
        {
          key: "nav.personnel",
          href: "/head-nurse/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/head-nurse/personnel", "/head-nurse/specialists", "/head-nurse/calendar"],
        },
        {
          key: "nav.tasks",
          href: "/head-nurse/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/head-nurse/workflow",
            "/head-nurse/shift-checklists",
            "/head-nurse/timeline",
          ],
        },
        {
          key: "nav.messages",
          href: "/head-nurse/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
        },
        { key: "nav.support", href: "/head-nurse/support", icon: Bug, group: "more" },
        { key: "nav.settings", href: "/head-nurse/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  /** Supervisor role — 6 primary nav items */
  supervisor: [
    {
      items: [
        {
          key: "nav.dashboard",
          href: "/supervisor",
          icon: LayoutDashboard,
          activeForPaths: ["/supervisor/emergency", "/supervisor/floorplans"],
        },
        {
          key: "nav.patients",
          href: "/supervisor/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/supervisor/personnel", "/supervisor/prescriptions"],
        },
        {
          key: "nav.tasks",
          href: "/supervisor/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/supervisor/workflow",
            "/supervisor/calendar",
            "/supervisor/directives",
          ],
        },
        {
          key: "nav.messages",
          href: "/supervisor/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
        },
        { key: "nav.support", href: "/supervisor/support", icon: Bug, group: "more" },
        { key: "nav.settings", href: "/supervisor/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  /** Observer role — 5 items (down from 12) */
  observer: [
    {
      items: [
        {
          key: "nav.dashboard",
          href: "/observer",
          icon: LayoutDashboard,
          activeForPaths: ["/observer/devices", "/observer/floorplans"],
        },
        {
          key: "nav.observer.myPatients",
          href: "/observer/personnel",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/observer/personnel", "/observer/prescriptions"],
        },
        {
          key: "nav.tasks",
          href: "/observer/tasks",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: [
            "/observer/workflow",
            "/observer/alerts",
            "/observer/calendar",
          ],
          badge: "alerts",
        },
        {
          key: "nav.messages",
          href: "/observer/messages",
          icon: Inbox,
          requiredCapability: "messages.manage",
          group: "more",
        },
        { key: "nav.support", href: "/observer/support", icon: Bug, group: "more" },
        { key: "nav.settings", href: "/observer/settings", icon: Settings, group: "more" },
      ],
    },
  ],

  /** Patient role — hub dashboard + care + messages + support + settings */
  patient: [
    {
      items: [
        {
          key: "nav.dashboard",
          href: "/patient",
          icon: LayoutDashboard,
          inactiveWhenQueryMatch: { param: "tab", value: "support" },
        },
        {
          key: "nav.myCare",
          href: "/patient/schedule",
          icon: HeartPulse,
          activeForPaths: ["/patient/services", "/patient/pharmacy"],
          group: "more",
        },
        {
          key: "nav.messages",
          href: "/patient/messages",
          icon: MessageSquare,
          group: "more",
        },
        {
          key: "nav.support",
          href: "/patient?tab=support",
          icon: Bug,
          activeWhenQueryMatch: { param: "tab", value: "support" },
          group: "more",
        },
        {
          key: "nav.settings",
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
