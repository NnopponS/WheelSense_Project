import nextConfig from "../next.config";
import {
  getAccountManagementPath,
  getAlertsPath,
  getCaregiversPath,
  getDevicesPath,
  getFacilityManagementPath,
  getMonitoringPath,
  getPatientsPath,
  getRoleHome,
} from "./routes";
import { canAccessAppRole, hasCapability } from "./permissions";
import { alertsInboxPath, staffMessagesPath, workflowTasksPath } from "./notificationRoutes";
import { CANONICAL_STAFF_ROLES, canonicalizeRole } from "./roles";
import { canDeleteWorkflowMessage } from "./workflowMessaging";
import { getNavConfig, partitionNavByGroup } from "./sidebarConfig";

function hrefsFor(role: string) {
  const { primary, more } = partitionNavByGroup(getNavConfig(role));
  return {
    primary: primary.flatMap((group) => group.items.map((item) => item.href)),
    more: more.map((item) => item.href),
  };
}

describe("role route helpers", () => {
  it("canonicalizes legacy roles to head_caregiver / caregiver", () => {
    expect(canonicalizeRole("head_nurse")).toBe("head_caregiver");
    expect(canonicalizeRole("supervisor")).toBe("head_caregiver");
    expect(canonicalizeRole("observer")).toBe("caregiver");
    expect(CANONICAL_STAFF_ROLES).toEqual(["admin", "head_caregiver", "caregiver"]);
  });

  it("returns the redesigned role home routes", () => {
    expect(getRoleHome("admin")).toBe("/admin");
    expect(getRoleHome("head_nurse")).toBe("/head-caregiver");
    expect(getRoleHome("supervisor")).toBe("/head-caregiver");
    expect(getRoleHome("head_caregiver")).toBe("/head-caregiver");
    expect(getRoleHome("observer")).toBe("/caregiver");
    expect(getRoleHome("caregiver")).toBe("/caregiver");
    expect(getRoleHome("patient")).toBe("/patient");
  });

  it("keeps role-aware helper paths stable", () => {
    expect(getPatientsPath("admin")).toBe("/admin/patients");
    expect(getPatientsPath("patient")).toBe("/patient?tab=profile");
    expect(getCaregiversPath("admin")).toBe("/admin/caregivers");
    expect(getAccountManagementPath("admin")).toBe("/admin/account-management");
    expect(getFacilityManagementPath("admin")).toBe("/admin/facility-management");
    expect(getDevicesPath("head_caregiver")).toBe("/head-caregiver/devices");
    expect(getMonitoringPath("caregiver", 12)).toBe("/caregiver/floorplans?room=12");
    expect(getAlertsPath("head_caregiver", 3)).toBe("/head-caregiver/emergency?room=3");
  });
});

describe("role navigation model", () => {
  it("keeps admin desktop navigation grouped around system governance", () => {
    expect(hrefsFor("admin")).toEqual({
      primary: ["/admin", "/admin/personnel", "/admin/facility-management", "/admin/devices", "/admin/tasks"],
      more: ["/admin/settings"],
    });
  });

  it("maps legacy head_nurse to canonical head_caregiver navigation", () => {
    // head_nurse canonicalizes to head_caregiver, so it gets the same nav
    expect(hrefsFor("head_nurse")).toEqual(hrefsFor("head_caregiver"));
  });

  it("canonicalizes legacy notification links and operational message permissions", () => {
    expect(alertsInboxPath("admin")).toBe("/admin/alerts");
    expect(alertsInboxPath("head_nurse")).toBe("/head-caregiver/emergency");
    expect(workflowTasksPath("head_nurse")).toBe("/head-caregiver/tasks");
    expect(staffMessagesPath("head_nurse")).toBe("/head-caregiver/messages");
    expect(
      canDeleteWorkflowMessage(
        { id: 1, role: "head_caregiver" },
        { sender_user_id: 2, recipient_user_id: null },
      ),
    ).toBe(true);
  });

  it("gives head_caregiver the operational-lead capabilities without admin-only facility management", () => {
    expect(hasCapability("head_caregiver", "users.manage")).toBe(true);
    expect(hasCapability("head_caregiver", "caregivers.manage")).toBe(true);
    expect(hasCapability("head_caregiver", "facilities.manage")).toBe(false);
    expect(canAccessAppRole("head_caregiver", "/admin")).toBe(false);
    expect(canAccessAppRole("head_nurse", "/head-caregiver")).toBe(true);
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

describe("legacy route redirects", () => {
  it("redirects old role routes to new canonical routes", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/supervisor", destination: "/head-caregiver" }),
        expect.objectContaining({ source: "/supervisor/:path*", destination: "/head-caregiver/:path*" }),
        expect.objectContaining({ source: "/head-nurse", destination: "/head-caregiver" }),
        expect.objectContaining({ source: "/head-nurse/:path*", destination: "/head-caregiver/:path*" }),
        expect.objectContaining({ source: "/observer", destination: "/caregiver" }),
        expect.objectContaining({ source: "/observer/:path*", destination: "/caregiver/:path*" }),
      ]),
    );
  });
});
