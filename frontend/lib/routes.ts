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
