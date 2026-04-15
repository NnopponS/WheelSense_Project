import { redirect } from "next/navigation";

export default function SupervisorDirectivesRedirectPage() {
  redirect("/supervisor/tasks?tab=workflow");
}
