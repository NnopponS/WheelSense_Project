"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PatientCareCoordinationPanel } from "@/components/patients/PatientCareCoordinationPanel";
import { getSafePatientListReturnTo } from "@/lib/patientListContext";

export default function ObserverPatientDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const patientId = Number(rawId);
  const patientListHref = getSafePatientListReturnTo(
    searchParams.get("returnTo"),
    "/caregiver/personnel",
  );

  return (
    <PatientCareCoordinationPanel
      patientId={patientId}
      showHeader
      invalidBackHref={patientListHref}
    />
  );
}
