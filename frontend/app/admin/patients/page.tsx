"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { Plus } from "lucide-react";
import type { Patient } from "@/lib/types";
import PatientList from "@/components/shared/PatientList";

export default function PatientsPage() {
  const { t } = useTranslation();
  const { data: patients, isLoading } = useQuery<Patient[]>("/patients");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">{t("patients.title")}</h2>
        </div>
        <button className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-smooth cursor-pointer">
          <Plus className="w-4 h-4" />
          {t("patients.addNew")}
        </button>
      </div>

      <PatientList
        patients={patients}
        isLoading={isLoading}
        basePath="/admin/patients"
      />
    </div>
  );
}
