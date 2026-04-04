"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@/hooks/useQuery";
import type { Patient } from "@/lib/types";

export default function SupervisorPatientDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: patient, isLoading } = useQuery<Patient>(
    Number.isFinite(id) ? `/patients/${id}` : null,
  );

  if (isLoading || !patient) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold">
        {patient.first_name} {patient.last_name}
      </h2>
      <p className="text-sm text-on-surface-variant mt-2">
        Vitals history & directives — extend with charts.
      </p>
    </div>
  );
}
