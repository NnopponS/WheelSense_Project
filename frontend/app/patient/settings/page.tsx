import { redirect } from "next/navigation";

export default function PatientSettingsRedirectPage() {
  redirect("/account");
}
