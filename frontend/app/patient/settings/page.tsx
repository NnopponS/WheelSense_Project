import { redirect } from "next/navigation";

/** Canonical user account/settings (email, phone, avatar, password) — same as other roles. */
export default function PatientSettingsRedirectPage() {
  redirect("/account");
}
