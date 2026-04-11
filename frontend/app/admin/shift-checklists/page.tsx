import { redirect } from "next/navigation";

/** Legacy URL: shift checklist is now per staff under Personnel → staff → "Shift checklist & calendar". */
export default function AdminShiftChecklistsRedirectPage() {
  redirect("/admin/personnel");
}
