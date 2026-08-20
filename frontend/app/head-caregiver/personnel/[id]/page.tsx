import { redirect } from "next/navigation";

export default function HeadCaregiverPersonnelDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/head-caregiver/patients/${params.id}`);
}
