"use client";
"use no memo";

import { Suspense } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList, MessageSquare, NotebookPen, Pill, Search, Users } from "lucide-react";
import ObserverPrescriptionsPage from "@/app/observer/prescriptions/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type {
  CareTaskOut,
  ListPatientsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
} from "@/lib/api/task-scope-types";

const TABS: HubTab[] = [
  { key: "patients", label: "Patients", icon: Users },
  { key: "prescriptions", label: "Prescriptions", icon: Pill },
];

export default function ObserverPatientsPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "patients" && <PatientsContent />}
      {tab === "prescriptions" && <ObserverPrescriptionsPage />}
    </div>
  );
}

type PatientRow = {
  id: number;
  fullName: string;
  nickname: string;
  careLevel: string;
  roomId: number | null;
  openTaskCount: number;
  unreadMessageCount: number;
  handoverCount: number;
};

function observerCareLevelKey(level: string): TranslationKey {
  switch (level) {
    case "critical":
      return "patients.careLevelCritical";
    case "special":
      return "patients.careLevelSpecial";
    case "standard":
      return "patients.careLevelStandard";
    default:
      return "patients.careLevelStandard";
  }
}

function PatientsContent() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const patientsQuery = useQuery({
    queryKey: ["observer", "patients", "list"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["observer", "patients", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });

  const messagesQuery = useQuery({
    queryKey: ["observer", "patients", "messages"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 300 }),
  });

  const handoversQuery = useQuery({
    queryKey: ["observer", "patients", "handovers"],
    queryFn: () => api.listWorkflowHandovers({ limit: 300 }),
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );
  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );

  const rows = useMemo<PatientRow[]>(() => {
    const q = search.trim().toLowerCase();

    return patients
      .filter((patient) => {
        if (!q) return true;
        const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        return (
          fullName.includes(q) ||
          patient.nickname.toLowerCase().includes(q) ||
          String(patient.id).includes(q)
        );
      })
      .map((patient) => {
        const openTaskCount = tasks.filter(
          (task) =>
            task.patient_id === patient.id &&
            task.status !== "completed" &&
            task.status !== "cancelled",
        ).length;
        const unreadMessageCount = messages.filter(
          (message) => message.patient_id === patient.id && !message.is_read,
        ).length;
        const handoverCount = handovers.filter(
          (handover) => handover.patient_id === patient.id,
        ).length;

        return {
          id: patient.id,
          fullName: `${patient.first_name} ${patient.last_name}`.trim(),
          nickname: patient.nickname,
          careLevel: patient.care_level,
          roomId: patient.room_id,
          openTaskCount,
          unreadMessageCount,
          handoverCount,
        };
      });
  }, [handovers, messages, patients, search, tasks]);

  const columns = useMemo<ColumnDef<PatientRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("patients.colPatient"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.nickname || t("observer.patients.noNickname")} • {t("patients.recordId")} #
              {row.original.id}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: t("observer.patients.careLevel"),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.careLevel === "critical"
                ? "destructive"
                : row.original.careLevel === "special"
                  ? "warning"
                  : "success"
            }
          >
            {t(observerCareLevelKey(row.original.careLevel))}
          </Badge>
        ),
      },
      {
        accessorKey: "roomId",
        header: t("observer.patients.room"),
        cell: ({ row }) =>
          row.original.roomId != null
            ? `${t("patients.roomPrefix")} #${row.original.roomId}`
            : t("observer.patients.unassigned"),
      },
      {
        accessorKey: "openTaskCount",
        header: t("observer.patients.openTasks"),
      },
      {
        accessorKey: "unreadMessageCount",
        header: t("observer.patients.unreadMessages"),
      },
      {
        accessorKey: "handoverCount",
        header: t("observer.patients.handovers"),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/observer/personnel/${row.original.id}`}>{t("observer.patients.openDetail")}</Link>
          </Button>
        ),
      },
    ],
    [t],
  );

  const openTaskTotal = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  ).length;
  const unreadTotal = messages.filter((message) => !message.is_read).length;

  const isLoadingAny =
    patientsQuery.isLoading ||
    tasksQuery.isLoading ||
    messagesQuery.isLoading ||
    handoversQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("observer.patients.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("observer.patients.subtitle")}</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Users} label={t("observer.patients.assignedPatients")} value={patients.length} tone="info" />
        <SummaryStatCard icon={ClipboardList} label={t("observer.patients.openTasks")} value={openTaskTotal} tone="warning" />
        <SummaryStatCard icon={MessageSquare} label={t("observer.patients.unreadMessages")} value={unreadTotal} tone="warning" />
        <SummaryStatCard icon={NotebookPen} label={t("observer.patients.recentHandovers")} value={handovers.length} tone="info" />
      </section>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("observer.patients.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      <DataTableCard
        title={t("observer.patients.coverageTitle")}
        description={t("observer.patients.coverageDesc")}
        data={rows}
        columns={columns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patients.noMatch")}
      />
    </div>
  );
}
