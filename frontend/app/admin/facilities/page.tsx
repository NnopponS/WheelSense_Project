import { redirect } from "next/navigation";

/** Redirect: facilities merged into /admin/monitoring?tab=facilities */
export default function FacilitiesRedirectPage() {
  redirect("/admin/monitoring?tab=facilities");
}
