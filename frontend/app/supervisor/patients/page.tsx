"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/useQuery";
import type { Patient } from "@/lib/types";
import EmptyState from "@/components/EmptyState";
import { Users } from "lucide-react";

export default function SupervisorPatientsPage() {
  const { data: patients, isLoading } = useQuery<Patient[]>("/patients");

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!patients?.length) {
    return <EmptyState icon={Users} message="No patients." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Patients</h2>
      <ul className="space-y-2">
        {patients.map((p) => (
          <li key={p.id}>
            <Link
              className="block surface-card p-4"
              href={`/supervisor/patients/${p.id}`}
            >
              {p.first_name} {p.last_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
