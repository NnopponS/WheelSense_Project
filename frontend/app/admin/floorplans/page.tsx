import { redirect } from "next/navigation";

/** Redirect: floorplans merged into /admin/monitoring?tab=floorplans */
export default function FloorplansRedirectPage() {
  redirect("/admin/monitoring?tab=floorplans");
}
