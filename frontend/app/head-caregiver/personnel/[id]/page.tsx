import { redirect } from "next/navigation";

export default async function HeadCaregiverPersonnelDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/head-caregiver/patients/${encodeURIComponent(id)}`);
}
