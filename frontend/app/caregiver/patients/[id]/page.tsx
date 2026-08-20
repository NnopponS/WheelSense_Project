"use client";

import { useParams } from "next/navigation";
import { PatientCareCoordinationPanel } from "@/components/patients/PatientCareCoordinationPanel";

export default function CaregiverPatientDetailPage() {
  const params = useParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const patientId = Number(rawId);

  return (
    <PatientCareCoordinationPanel
      patientId={patientId}
      showHeader
      invalidBackHref="/caregiver/patients"
    />
  );
}
