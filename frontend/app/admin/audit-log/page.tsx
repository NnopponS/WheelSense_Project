import { redirect } from "next/navigation";

/** Legacy audit URL now redirects to the canonical audit page. */
export default function AdminAuditLogRedirectPage() {
  redirect("/admin/audit");
}
