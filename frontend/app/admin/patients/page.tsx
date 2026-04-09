"use client";

import { useCallback, useState } from "react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import type { Patient, User } from "@/lib/types";
import AddPatientModal from "@/components/admin/patients/AddPatientModal";
import { PatientsDataTable } from "@/components/admin/patients/PatientsDataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PatientsPage() {
  const { t } = useTranslation();
  const { data: patients, isLoading, refetch } = useQuery<Patient[]>("/patients");
  const { data: users } = useQuery<User[]>("/users");
  const [modalOpen, setModalOpen] = useState(false);
  const [sharedSearch, setSharedSearch] = useState("");
  const [careLevelFilter, setCareLevelFilter] = useState<"all" | Patient["care_level"]>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roomFilter, setRoomFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const unlinkedPatientAccounts =
    users?.filter(
      (item) => item.is_active && item.role === "patient" && item.patient_id == null,
    ).length ?? 0;

  const onCreated = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("patients.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Standardized registry view with shared filters, sortable columns, and validated intake.
          </p>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("patients.addNew")}
        </Button>
      </div>

      {unlinkedPatientAccounts > 0 ? (
        <div className="rounded-xl border border-amber-400/45 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">
            {unlinkedPatientAccounts} active patient account(s) are not linked.
          </span>{" "}
          <Link href="/admin/account-management" className="font-semibold underline">
            Open account management
          </Link>
          {" "}to assign them to the correct patient records.
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("patients.search")}
              value={sharedSearch}
              onChange={(event) => setSharedSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <FilterSelect
            value={careLevelFilter}
            onValueChange={(value) =>
              setCareLevelFilter(value as "all" | Patient["care_level"])
            }
            placeholder={t("patients.careLevel")}
            options={[
              { value: "all", label: t("devicesDetail.tabAll") },
              { value: "normal", label: "normal" },
              { value: "special", label: "special" },
              { value: "critical", label: "critical" },
            ]}
          />
          <FilterSelect
            value={activeStatusFilter}
            onValueChange={(value) =>
              setActiveStatusFilter(value as "all" | "active" | "inactive")
            }
            placeholder={t("patients.accountStatus")}
            options={[
              { value: "all", label: t("devicesDetail.tabAll") },
              { value: "active", label: t("patients.statusActive") },
              { value: "inactive", label: t("patients.statusInactive") },
            ]}
          />
          <FilterSelect
            value={roomFilter}
            onValueChange={(value) =>
              setRoomFilter(value as "all" | "assigned" | "unassigned")
            }
            placeholder={t("patients.room")}
            options={[
              { value: "all", label: t("devicesDetail.tabAll") },
              { value: "assigned", label: "Room assigned" },
              { value: "unassigned", label: t("patients.noRoom") },
            ]}
          />
        </CardContent>
      </Card>

      <PatientsDataTable
        patients={patients}
        isLoading={isLoading}
        search={sharedSearch}
        careLevel={careLevelFilter}
        activeStatus={activeStatusFilter}
        room={roomFilter}
      />

      <AddPatientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={`${placeholder}-${option.value}`} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
