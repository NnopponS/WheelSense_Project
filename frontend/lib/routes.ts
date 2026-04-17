/** Default home path for a backend role (JWT `role` claim). */
export function getRoleHome(role: string): string {
  switch (role) {
    case "head_nurse":
      return "/head-nurse";
    case "supervisor":
      return "/supervisor";
    case "observer":
      return "/observer";
    case "patient":
      return "/patient";
    case "admin":
    default:
      return "/admin";
  }
}

/** Get personnel page path based on role. */
export function getPersonnelPath(role: string): string {
  if (role === "admin") return "/admin/personnel";
  return `/${role.replaceAll("_", "-")}/personnel`;
}

/** Get patients roster path based on role. */
export function getPatientsPath(role: string): string {
  if (role === "patient") return "/patient?tab=profile";
  if (role === "admin") return "/admin/patients";
  return `/${role.replaceAll("_", "-")}/patients`;
}

/** Get caregivers / staff directory path based on role. */
export function getCaregiversPath(role: string): string {
  if (role === "patient") return "/patient";
  if (role === "admin") return "/admin/caregivers";
  return `/${role.replaceAll("_", "-")}/caregivers`;
}

/** Get account management path based on role. */
export function getAccountManagementPath(role: string): string {
  if (role === "admin") return "/admin/account-management";
  return `/${role.replaceAll("_", "-")}/account-management`;
}

/** Get facility management path based on role. */
export function getFacilityManagementPath(role: string): string {
  if (role === "admin") return "/admin/facility-management";
  return `/${role.replaceAll("_", "-")}/facility-management`;
}

/** Get path to patient detail profile based on user role. */
export function getPatientDetailPath(role: string, patientId: number | string): string {
  if (role === "patient") return "/patient?tab=profile";
  if (role === "admin") return `/admin/patients/${patientId}`;
  return `/${role.replaceAll("_", "-")}/patients/${patientId}`;
}

/** Get path to caregiver detail profile based on user role. */
export function getCaregiverDetailPath(role: string, caregiverId: number | string): string {
  if (role === "admin") return `/admin/caregivers/${caregiverId}`;
  return `/${role.replaceAll("_", "-")}/caregivers/${caregiverId}`;
}

/** Get devices management path based on role. */
export function getDevicesPath(role: string): string {
  if (role === "admin") return "/admin/devices";
  return `/${role.replaceAll("_", "-")}/devices`;
}

/** Get ML calibration path based on role. */
export function getMlCalibrationPath(role: string): string {
  if (role === "admin") return "/admin/ml-calibration";
  return `/${role.replaceAll("_", "-")}/ml-calibration`;
}

/** Get monitoring page path based on role. */
export function getMonitoringPath(role: string, roomId?: number | string): string {
  const base = `/${role.replaceAll("_", "-")}/monitoring`;
  return roomId !== undefined ? `${base}?room=${roomId}` : base;
}

/** Get alerts page path based on role. */
export function getAlertsPath(role: string, roomId?: number | string): string {
  const base = `/${role.replaceAll("_", "-")}/alerts`;
  return roomId !== undefined ? `${base}?room=${roomId}` : base;
}
