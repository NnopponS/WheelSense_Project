import { redirect } from "next/navigation";

export default function PatientSupportPage() {
  redirect("/patient?tab=support");
}
