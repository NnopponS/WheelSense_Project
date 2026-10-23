import nextConfig from "../next.config";
import {
  getAccountManagementPath,
  getAlertsPath,
  getCaregiversPath,
  getDevicesPath,
  getFacilityManagementPath,
  getMonitoringPath,
  getPatientsPath,
  getPersonnelPath,
  getRoleHome,
} from "./routes";
import { isNavItemActive, ROLE_NAV_CONFIGS, partitionNavByGroup } from "./sidebarConfig";

function hrefsFor(role: keyof typeof ROLE_NAV_CONFIGS) {
  const { primary, more } = partitionNavByGroup(ROLE_NAV_CONFIGS[role]);
  return {
    primary: primary.flatMap((group) => group.items.map((item) => item.href)),
    more: more.map((item) => item.href),
  };
}

describe("role route helpers", () => {
  it("returns the redesigned role home routes", () => {
    expect(getRoleHome("admin")).toBe("/admin");
    expect(getRoleHome("head_caregiver")).toBe("/head-caregiver");
    expect(getRoleHome("head_caregiver")).toBe("/head-caregiver");
    expect(getRoleHome("caregiver")).toBe("/caregiver");
    expect(getRoleHome("patient")).toBe("/patient");
  });

  it("keeps role-aware helper paths stable", () => {
    expect(getPersonnelPath("admin")).toBe("/admin/patients");
    expect(getPersonnelPath("head_caregiver")).toBe("/head-caregiver/personnel");
    expect(getPatientsPath("admin")).toBe("/admin/patients");
    expect(getPatientsPath("patient")).toBe("/patient?tab=profile");
    expect(getCaregiversPath("admin")).toBe("/admin/caregivers");
    expect(getAccountManagementPath("admin")).toBe("/admin/account-management");
    expect(getFacilityManagementPath("admin")).toBe("/admin/facility-management");
    expect(getDevicesPath("head_caregiver")).toBe("/head-caregiver/devices");
    expect(getMonitoringPath("caregiver", 12)).toBe("/caregiver/floorplans?room=12");
    expect(getAlertsPath("head_caregiver", 3)).toBe("/head-caregiver/alerts?room=3");
  });
});

describe("role navigation model", () => {
  it("makes every administrative domain and advanced destination reachable", () => {
    const config = ROLE_NAV_CONFIGS.admin;
    expect(config.map(group => group.categoryKey).filter(Boolean)).toEqual([
      "redesign.nav.people", "redesign.nav.facilities", "redesign.nav.monitoring", "redesign.nav.operations", "redesign.nav.admin",
    ]);
    const { primary, more } = hrefsFor("admin");
    expect(primary).toEqual(expect.arrayContaining(["/admin/patients", "/admin/caregivers", "/admin/devices", "/admin/alerts", "/admin/tasks", "/admin/settings"]));
    expect(more).toEqual(expect.arrayContaining(["/admin/account-management", "/admin/audit", "/admin/ml-calibration", "/admin/demo-control"]));
  });

  it.each(["admin", "head_caregiver", "caregiver", "patient"])("does not duplicate destinations for %s", role => {
    const links = ROLE_NAV_CONFIGS[role].flatMap(group => group.items.map(item => item.href));
    expect(new Set(links).size).toBe(links.length);
  });

  it("keeps clinical destinations inside their role routes", () => {
    for (const role of ["head_caregiver", "caregiver"] as const) {
      const root = role.replaceAll("_", "-");
      expect(ROLE_NAV_CONFIGS[role].flatMap(group => group.items).every(item => item.href.startsWith(`/${root}`))).toBe(true);
    }
  });
});

describe("active navigation state", () => {
  const params = (values: Record<string, string> = {}) => ({
    get: (name: string) => values[name] ?? null,
  });

  it("keeps a destination active on its detail routes without matching sibling prefixes", () => {
    const personnel = ROLE_NAV_CONFIGS.admin.flatMap(group => group.items).find((item) => item.href === "/admin/patients")!;

    expect(isNavItemActive(personnel, "/admin/patients/42", params(), "admin")).toBe(true);
    expect(isNavItemActive(personnel, "/admin/patients-archive", params(), "admin")).toBe(false);
  });

  it("distinguishes patient home from a query-backed support destination", () => {
    const items = ROLE_NAV_CONFIGS.patient.flatMap((group) => group.items);
    const home = items.find((item) => item.href === "/patient")!;
    const support = items.find((item) => item.href === "/patient?tab=support")!;

    expect(isNavItemActive(home, "/patient", params({ tab: "support" }), "patient")).toBe(false);
    expect(isNavItemActive(support, "/patient", params({ tab: "support" }), "patient")).toBe(true);
  });

  it("honors explicit aliases such as the shared account route", () => {
    const account = ROLE_NAV_CONFIGS.patient
      .flatMap((group) => group.items)
      .find((item) => item.href === "/patient/settings")!;

    expect(isNavItemActive(account, "/account", params(), "patient")).toBe(true);
  });
});

describe("legacy route redirects", () => {
  it("keeps existing workflow aliases pointed at redesigned role homes", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/head-caregiver/workflow", destination: "/head-caregiver/tasks" }),
        expect.objectContaining({ source: "/head-caregiver/workflow", destination: "/head-caregiver/tasks" }),
        expect.objectContaining({ source: "/caregiver/workflow", destination: "/caregiver/tasks" }),
      ]),
    );
  });
});
