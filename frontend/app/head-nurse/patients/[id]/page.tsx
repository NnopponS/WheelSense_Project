import { redirect } from "next/navigation";

export default async function HeadNursePatientDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/head-nurse/personnel/${encodeURIComponent(id)}`);
}
