import { redirect } from "next/navigation";
import MonitoringClient from "./MonitoringClient";
import { legacyMonitoringTabRedirect } from "@/lib/monitoringWorkspace";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const path = "/admin/monitoring";
  const legacy = legacyMonitoringTabRedirect(path, sp);
  if (legacy) {
    redirect(legacy);
  }
  return <MonitoringClient />;
}
