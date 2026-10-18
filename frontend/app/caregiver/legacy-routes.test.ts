import { redirect } from "next/navigation";
import AccountManagementPage from "./account-management/page";
import CaregiversPage from "./caregivers/page";
import CaregiverDetailPage from "./caregivers/[id]/page";
import CalibrationPage from "./ml-calibration/page";
import FacilityManagementPage from "./facility-management/page";

jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

describe("caregiver legacy routes", () => {
  it.each([
    [AccountManagementPage, "/caregiver/settings"],
    [CaregiversPage, "/caregiver"],
    [CaregiverDetailPage, "/caregiver"],
    [CalibrationPage, "/caregiver/devices"],
    [FacilityManagementPage, "/caregiver/floorplans"],
  ] as const)("redirects %p without mounting an administrative page", (Page, destination) => {
    jest.mocked(redirect).mockImplementation(() => {
      throw new Error("redirect");
    });

    expect(() => Page()).toThrow("redirect");
    expect(redirect).toHaveBeenLastCalledWith(destination);
  });
});
