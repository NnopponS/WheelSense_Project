import { redirect } from "next/navigation";

/** Legacy facilities URL now redirects to the canonical facility-management page. */
export default function FacilitiesRedirectPage() {
  redirect("/admin/facility-management");
}
