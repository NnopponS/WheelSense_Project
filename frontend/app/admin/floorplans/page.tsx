import { redirect } from "next/navigation";

/** Legacy floorplans URL now redirects to the canonical facility-management page. */
export default function FloorplansRedirectPage() {
  redirect("/admin/facility-management");
}
