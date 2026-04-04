"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import type { Patient } from "@/lib/types";
import PatientList from "@/components/shared/PatientList";

export default function HeadNursePatientsPage() {
  const { t } = useTranslation();
  const { data: patients, isLoading } = useQuery<Patient[]>("/patients");

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-on-surface">{t("patients.title")}</h2>
      <PatientList
        patients={patients}
        isLoading={isLoading}
        basePath="/head-nurse/patients"
      />
    </div>
  );
}
