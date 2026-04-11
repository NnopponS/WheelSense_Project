import { redirect } from "next/navigation";

export default function DeviceHealthRedirectPage() {
  redirect("/admin/devices");
}
