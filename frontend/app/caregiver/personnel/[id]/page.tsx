import { redirect } from "next/navigation";

export default async function CaregiverPersonnelDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/caregiver/patients/${encodeURIComponent(id)}`);
}
