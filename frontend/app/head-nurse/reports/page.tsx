import { redirect } from "next/navigation";

export default function HeadNurseReportsRedirectPage() {
  redirect("/head-nurse/workflow?tab=reports");
}
