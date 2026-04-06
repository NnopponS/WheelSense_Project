import { redirect } from "next/navigation";

/** Legacy URL: smart devices live under Device Fleet → Smart device tab. */
export default function SmartDevicesRedirectPage() {
  redirect("/admin/devices?tab=smart_home");
}
