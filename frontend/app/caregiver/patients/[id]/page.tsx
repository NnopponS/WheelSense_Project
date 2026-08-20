import { redirect } from "next/navigation";

export default async function CaregiverPatientDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/caregiver/personnel/${encodeURIComponent(id)}`);
}
