import { redirect } from "next/navigation";

/** Legacy URL: user management now lives under account management. */
export default function AdminUsersRedirectPage() {
  redirect("/admin/account-management");
}
