import { redirect } from "next/navigation";

export default async function ObserverPatientDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/observer/personnel/${encodeURIComponent(id)}`);
}
