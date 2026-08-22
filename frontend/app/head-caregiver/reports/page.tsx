import { redirect } from "next/navigation";

export default function HeadNurseReportsRedirectPage() {
  redirect("/head-caregiver/tasks?wtab=reports");
}
