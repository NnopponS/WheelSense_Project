"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList, MessageSquare, NotebookPen, Search, Users } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type {
  CareTaskOut,
  ListPatientsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
} from "@/lib/api/task-scope-types";

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

export default function ObserverPatientsPage() {
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
        header: "Patient",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.nickname || "No nickname"} • ID #{row.original.id}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: "Care level",
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
            {row.original.careLevel}
          </Badge>
        ),
      },
      {
        accessorKey: "roomId",
        header: "Room",
        cell: ({ row }) => (row.original.roomId != null ? `Room #${row.original.roomId}` : "Unassigned"),
      },
      {
        accessorKey: "openTaskCount",
        header: "Open tasks",
      },
      {
        accessorKey: "unreadMessageCount",
        header: "Unread messages",
      },
      {
        accessorKey: "handoverCount",
        header: "Handovers",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/observer/patients/${row.original.id}`}>Open detail</Link>
          </Button>
        ),
      },
    ],
    [],
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
        <h2 className="text-2xl font-bold text-foreground">My Patients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track patient-level tasks, unread role messages, and handover context.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Users} label="Assigned patients" value={patients.length} tone="info" />
        <SummaryStatCard icon={ClipboardList} label="Open tasks" value={openTaskTotal} tone="warning" />
        <SummaryStatCard icon={MessageSquare} label="Unread messages" value={unreadTotal} tone="warning" />
        <SummaryStatCard icon={NotebookPen} label="Recent handovers" value={handovers.length} tone="info" />
      </section>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search patient by name, nickname, or ID"
          className="pl-9"
        />
      </div>

      <DataTableCard
        title="Patient Coverage"
        description="Observer patient list with operational message and task indicators."
        data={rows}
        columns={columns}
        isLoading={isLoadingAny}
        emptyText="No patients match your search."
      />
    </div>
  );
}
