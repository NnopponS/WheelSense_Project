"use client";

import { useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { type Patient, type Prescription } from "@/lib/types";
import { ClipboardList } from "lucide-react";

export default function ObserverPrescriptionsPage() {
  const { data: prescriptions, isLoading } = useQuery<Prescription[]>("/future/prescriptions");
  const { data: patients } = useQuery<Patient[]>("/patients");

  const patientMap = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Prescription Board</h2>
        <p className="text-sm text-on-surface-variant">
          Review active medication plans while handling routine care tasks.
        </p>
      </div>

      <div className="surface-card p-4">
        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading prescriptions...</p>
        ) : !prescriptions || prescriptions.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No prescriptions assigned.</p>
        ) : (
          <div className="space-y-2">
            {prescriptions.map((item) => {
              const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
              return (
                <div key={item.id} className="rounded-lg border border-outline-variant/20 p-3">
                  <p className="font-medium text-on-surface inline-flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    {item.medication_name} ({item.dosage})
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {patient
                      ? `${patient.first_name} ${patient.last_name}`
                      : "No linked patient"}{" "}
                    • {item.frequency} • {item.status}
                  </p>
                  {item.instructions ? (
                    <p className="text-xs text-on-surface-variant mt-1">{item.instructions}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
