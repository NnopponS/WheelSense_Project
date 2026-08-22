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
  it("keeps admin desktop navigation grouped around system governance", () => {
    expect(hrefsFor("admin")).toEqual({
      primary: ["/admin", "/admin/patients", "/admin/facility-management", "/admin/devices", "/admin/tasks"],
      more: ["/admin/settings"],
    });
  });

  it("keeps head nurse desktop navigation centered on command work", () => {
    expect(hrefsFor("head_caregiver")).toEqual({
      primary: [
        "/head-caregiver",
        "/head-caregiver/emergency",
        "/head-caregiver/patients",
        "/head-caregiver/caregivers",
        "/head-caregiver/tasks",
        "/head-caregiver/messages",
      ],
      more: ["/head-caregiver/floorplans", "/head-caregiver/support", "/head-caregiver/settings"],
    });
  });

  it("keeps mobile-first role navigation compact", () => {
    expect(hrefsFor("head_caregiver")).toEqual({
      primary: ["/head-caregiver", "/head-caregiver/emergency", "/head-caregiver/patients", "/head-caregiver/caregivers", "/head-caregiver/tasks", "/head-caregiver/messages"],
      more: ["/head-caregiver/floorplans", "/head-caregiver/support", "/head-caregiver/settings"],
    });
    expect(hrefsFor("caregiver")).toEqual({
      primary: ["/caregiver", "/caregiver/tasks", "/caregiver/patients", "/caregiver/alerts", "/caregiver/messages"],
      more: ["/caregiver/support", "/caregiver/floorplans", "/caregiver/settings"],
    });
    expect(hrefsFor("patient")).toEqual({
      primary: ["/patient", "/patient/schedule", "/patient/pharmacy", "/patient/messages", "/patient/room-controls"],
      more: ["/patient?tab=support", "/patient/settings"],
    });
  });
});

describe("active navigation state", () => {
  const params = (values: Record<string, string> = {}) => ({
    get: (name: string) => values[name] ?? null,
  });

  it("keeps a destination active on its detail routes without matching sibling prefixes", () => {
    const personnel = ROLE_NAV_CONFIGS.admin[0].items.find((item) => item.href === "/admin/patients")!;

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
