"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { Plus } from "lucide-react";
import type { Patient } from "@/lib/types";
import PatientList from "@/components/shared/PatientList";
import AddPatientModal from "@/components/admin/patients/AddPatientModal";
import AdminPatientsQuickFind from "@/components/admin/patients/AdminPatientsQuickFind";

export default function PatientsPage() {
  const { t } = useTranslation();
  const { data: patients, isLoading, refetch } = useQuery<Patient[]>("/patients");
  const [modalOpen, setModalOpen] = useState(false);
  const [sharedSearch, setSharedSearch] = useState("");
  const [careLevelFilter, setCareLevelFilter] = useState<"all" | Patient["care_level"]>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roomFilter, setRoomFilter] = useState<"all" | "assigned" | "unassigned">("all");

  const onCreated = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const adminFilterProps = useMemo(
    () => ({
      careLevel: careLevelFilter,
      onCareLevelChange: setCareLevelFilter,
      activeStatus: activeStatusFilter,
      onActiveStatusChange: setActiveStatusFilter,
      room: roomFilter,
      onRoomChange: setRoomFilter,
    }),
    [careLevelFilter, activeStatusFilter, roomFilter],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">{t("patients.title")}</h2>
        </div>
        <button
          type="button"
          className="gradient-cta flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-smooth hover:opacity-90"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("patients.addNew")}
        </button>
      </div>

      <AdminPatientsQuickFind search={sharedSearch} onSearchChange={setSharedSearch} />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-on-surface-variant">
          {t("patients.allPatients")}
        </h3>
        <PatientList
          patients={patients}
          isLoading={isLoading}
          basePath="/admin/patients"
          showSearchInput={false}
          textFilter={sharedSearch}
          adminFilters={adminFilterProps}
        />
      </div>

      <AddPatientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
