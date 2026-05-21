"use client";

import { PersonSensorStatusPanel } from "@/components/shared/PersonSensorStatusPanel";

export function PatientMySensors({ patientId }: { patientId: number }) {
  return <PersonSensorStatusPanel personType="patient" personId={patientId} />;
}
