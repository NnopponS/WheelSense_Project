import AdminSettingsClient, { type SettingsTabKey } from "./SettingsClient";

function parseTab(tab: string | undefined): SettingsTabKey {
  if (tab === "ai" || tab === "ml") return tab;
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
