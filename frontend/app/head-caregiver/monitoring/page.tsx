import { redirect } from "next/navigation";

export default function SupervisorMonitoringRedirectPage() {
  redirect("/head-caregiver/floorplans");
}
