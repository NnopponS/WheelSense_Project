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
  Activity,
  MessageSquare,
  Bug,
  Inbox,
  LayoutGrid,
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
        { key: "nav.dashboard", href: "/admin", icon: LayoutDashboard },
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
          activeForPaths: ["/admin/monitoring"],
        },
        {
          key: "nav.settings",
          href: "/admin/settings",
          icon: Settings,
          activeForPaths: ["/admin/audit", "/admin/ml-calibration"],
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
        { key: "nav.dashboard", href: "/head-nurse", icon: LayoutDashboard },
        {
          key: "nav.monitoring",
          href: "/head-nurse/monitoring",
          icon: Activity,
          activeForPaths: ["/head-nurse/floorplans", "/head-nurse/alerts", "/head-nurse/reports"],
          badge: "alerts",
        },
        {
          key: "nav.patients",
          href: "/head-nurse/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/head-nurse/staff", "/head-nurse/specialists", "/head-nurse/calendar"],
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
        { key: "nav.support", href: "/head-nurse/support", icon: Bug },
        { key: "nav.settings", href: "/head-nurse/settings", icon: Settings },
      ],
    },
  ],

  /** Supervisor role — 5 items (down from 11) */
  supervisor: [
    {
      items: [
        { key: "nav.dashboard", href: "/supervisor", icon: LayoutDashboard },
        {
          key: "nav.monitoring",
          href: "/supervisor/monitoring",
          icon: LayoutGrid,
          activeForPaths: ["/supervisor/emergency", "/supervisor/floorplans"],
        },
        {
          key: "nav.patients",
          href: "/supervisor/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/supervisor/prescriptions"],
        },
        {
          key: "nav.workflow",
          href: "/supervisor/workflow",
          icon: ClipboardEdit,
          requiredCapability: "workflow.manage",
          activeForPaths: ["/supervisor/calendar", "/supervisor/directives"],
        },
        { key: "nav.support", href: "/supervisor/support", icon: Bug },
        { key: "nav.settings", href: "/supervisor/settings", icon: Settings },
      ],
    },
  ],

  /** Observer role — 5 items (down from 12) */
  observer: [
    {
      items: [
        { key: "nav.dashboard", href: "/observer", icon: LayoutDashboard },
        {
          key: "nav.monitoring",
          href: "/observer/monitoring",
          icon: Activity,
          activeForPaths: ["/observer/devices", "/observer/floorplans"],
        },
        {
          key: "nav.observer.myPatients",
          href: "/observer/patients",
          icon: Users,
          requiredCapability: "patients.read",
          activeForPaths: ["/observer/prescriptions"],
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
        { key: "nav.support", href: "/observer/support", icon: Bug },
        { key: "nav.settings", href: "/observer/settings", icon: Settings },
      ],
    },
  ],

  /** Patient role — 4 items (down from 8) */
  patient: [
    {
      items: [
        { key: "nav.dashboard", href: "/patient", icon: LayoutDashboard },
        {
          key: "nav.myCare",
          href: "/patient/schedule",
          icon: HeartPulse,
          activeForPaths: ["/patient/services", "/patient/pharmacy"],
        },
        {
          key: "nav.messages",
          href: "/patient/messages",
          icon: MessageSquare,
        },
        { key: "nav.support", href: "/patient/support", icon: Bug },
        { key: "nav.settings", href: "/patient/settings", icon: Settings },
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
