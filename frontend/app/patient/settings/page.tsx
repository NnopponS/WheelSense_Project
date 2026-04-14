import { redirect } from "next/navigation";

export default function PatientSettingsRedirectPage() {
  redirect("/patient?tab=profile");
}
