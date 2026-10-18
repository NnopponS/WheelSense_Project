/**
 * Sidebar navigation configuration - Single source of truth for all role navigation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
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
  admin: [
    { items: [{ key: "redesign.nav.overview", href: "/admin", icon: LayoutDashboard, mobilePriority: 1 }] },
    { categoryKey: "redesign.nav.people", items: [
      { key: "redesign.nav.residents", href: "/admin/patients", icon: Users, requiredCapability: "patients.read", mobilePriority: 2 },
      { key: "redesign.nav.staff", href: "/admin/caregivers", icon: Users, requiredCapability: "caregivers.read" },
    ] },
    { categoryKey: "redesign.nav.facilities", items: [
      { key: "redesign.nav.rooms", href: "/admin/facility-management", icon: MapPin, requiredCapability: "facilities.read", activeForPaths: ["/admin/floorplans", "/admin/facilities", "/admin/monitoring"] },
    ] },
    { categoryKey: "redesign.nav.monitoring", items: [
      { key: "nav.devices", href: "/admin/devices", icon: Tablet, requiredCapability: "devices.read", activeForPaths: ["/admin/smart-devices", "/admin/device-health"] },
    ] },
    { categoryKey: "redesign.nav.operations", items: [
      { key: "nav.alerts", href: "/admin/alerts", icon: Bell, requiredCapability: "alerts.read", mobilePriority: 3 },
      { key: "nav.tasks", href: "/admin/tasks", icon: ClipboardEdit, requiredCapability: "workflow.manage", activeForPaths: ["/admin/workflow", "/admin/shift-checklists", "/admin/timeline"], mobilePriority: 4 },
      { key: "nav.headNurse.messages", href: "/admin/messages", icon: Inbox, requiredCapability: "messages.manage" },
      { key: "nav.headNurse.support", href: "/admin/support", icon: Bug },
    ] },
    { categoryKey: "redesign.nav.admin", items: [
      { key: "nav.settings", href: "/admin/settings", icon: Settings, activeForPaths: ["/admin/profile", "/account"] },
      { key: "nav.users", href: "/admin/account-management", icon: Users, requiredCapability: "users.manage", activeForPaths: ["/admin/users"], group: "more" },
      { key: "nav.auditLog", href: "/admin/audit", icon: ClipboardEdit, activeForPaths: ["/admin/audit-log"], group: "more" },
      { key: "nav.mlCalibration", href: "/admin/ml-calibration", icon: Activity, group: "more" },
      { key: "nav.demoControl", href: "/admin/demo-control", icon: Monitor, group: "more" },
    ] },
  ],
  head_caregiver: [
    { items: [{ key: "redesign.nav.overview", href: "/head-caregiver", icon: LayoutDashboard, mobilePriority: 1 }] },
    { categoryKey: "redesign.nav.people", items: [
      { key: "redesign.nav.residents", href: "/head-caregiver/patients", icon: Users, requiredCapability: "patients.read", activeForPaths: ["/head-caregiver/personnel", "/head-caregiver/prescriptions"], mobilePriority: 3 },
      { key: "redesign.nav.staff", href: "/head-caregiver/caregivers", icon: Users, requiredCapability: "caregivers.read" },
    ] },
    { categoryKey: "redesign.nav.facilities", items: [
      { key: "redesign.nav.rooms", href: "/head-caregiver/floorplans", icon: MapPin, activeForPaths: ["/head-caregiver/monitoring", "/head-caregiver/facility-management"] },
    ] },
    { categoryKey: "redesign.nav.monitoring", items: [
      { key: "nav.devices", href: "/head-caregiver/devices", icon: Tablet, requiredCapability: "devices.read" },
    ] },
    { categoryKey: "redesign.nav.operations", items: [
      { key: "nav.headNurse.emergency", href: "/head-caregiver/emergency", icon: ShieldAlert, badge: "alerts", activeForPaths: ["/head-caregiver/alerts"], mobilePriority: 2 },
      { key: "nav.tasks", href: "/head-caregiver/tasks", icon: ClipboardEdit, requiredCapability: "workflow.manage", activeForPaths: ["/head-caregiver/workflow", "/head-caregiver/calendar", "/head-caregiver/directives", "/head-caregiver/reports"], mobilePriority: 4 },
      { key: "nav.headNurse.messages", href: "/head-caregiver/messages", icon: Inbox, requiredCapability: "messages.manage" },
      { key: "nav.headNurse.support", href: "/head-caregiver/support", icon: Bug },
    ] },
    { categoryKey: "redesign.nav.admin", items: [
      { key: "nav.headNurse.account", href: "/head-caregiver/settings", icon: Settings, activeForPaths: ["/account", "/head-caregiver/account-management"] },
      { key: "nav.mlCalibration", href: "/head-caregiver/ml-calibration", icon: Activity, group: "more" },
    ] },
  ],
  head_nurse: [],
  supervisor: [],
  caregiver: [
    { items: [{ key: "nav.observer.today", href: "/caregiver", icon: LayoutDashboard, mobilePriority: 1 }] },
    { categoryKey: "redesign.nav.people", items: [
      { key: "redesign.nav.residents", href: "/caregiver/patients", icon: Users, requiredCapability: "patients.read", activeForPaths: ["/caregiver/personnel", "/caregiver/prescriptions"], mobilePriority: 4 },
    ] },
    { categoryKey: "redesign.nav.facilities", items: [
      { key: "redesign.nav.rooms", href: "/caregiver/floorplans", icon: MapPin, activeForPaths: ["/caregiver/monitoring", "/caregiver/facility-management"] },
    ] },
    { categoryKey: "redesign.nav.monitoring", items: [
      { key: "nav.devices", href: "/caregiver/devices", icon: Tablet, requiredCapability: "devices.read" },
    ] },
    { categoryKey: "redesign.nav.operations", items: [
      { key: "nav.observer.alerts", href: "/caregiver/alerts", icon: Bell, badge: "alerts", mobilePriority: 2 },
      { key: "nav.observer.tasks", href: "/caregiver/tasks", icon: ClipboardEdit, requiredCapability: "workflow.manage", mobilePriority: 3 },
      { key: "nav.observer.handover", href: "/caregiver/messages", icon: Inbox, requiredCapability: "messages.manage" },
      { key: "nav.observer.support", href: "/caregiver/support", icon: Bug },
    ] },
    { categoryKey: "redesign.nav.admin", items: [
      { key: "nav.observer.account", href: "/caregiver/settings", icon: Settings, activeForPaths: ["/account", "/caregiver/account-management"] },
    ] },
  ],
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
