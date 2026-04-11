import AdminSettingsClient, { type SettingsTabKey } from "./SettingsClient";

function parseTab(tab: string | undefined): SettingsTabKey {
  if (tab === "ml" || tab === "system") return "system";
  if (tab === "audit") return "audit";
  if (tab === "ai" || tab === "server") return tab;
  return "profile";
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  return <AdminSettingsClient initialTab={parseTab(sp.tab)} />;
}
