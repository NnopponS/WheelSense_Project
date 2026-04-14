"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Search,
  Users,
  Plus,
  Calendar,
  Clock,
  Heart,
  UserCheck,
  AlertCircle,
  Filter,
  Trash2,
} from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { ListPatientsResponse, CareScheduleOut, CaregiverOut } from "@/lib/api/task-scope-types";

type CaregiverPatientAccessOut = {
  caregiver_id: number;
  patient_id: number;
  is_active: boolean;
};

type PatientRow = {
  id: number;
  fullName: string;
  careLevel: "critical" | "special" | "standard";
  roomId: number | null;
  status: "active" | "inactive";
  admissionDate: string | null;
  lastSeen: string | null;
  assignedCaregivers: string[];
  assignedCaregiversCount: number;
};

type Routine = {
  id: number;
  title: string;
  schedule_type: "medication" | "check_in" | "procedure" | "meal";
  time: string;
  frequency: string;
  assigned_to: string;
  status: "active" | "paused" | "completed";
};

type FilterType = "all" | "critical" | "unassigned" | "recent";

function formatCaregiver(caregiver: CaregiverOut): string {
  return `${caregiver.first_name} ${caregiver.last_name}`.trim() || `Caregiver #${caregiver.id}`;
}

function careLevelTranslationKey(level: PatientRow["careLevel"]): TranslationKey {
  switch (level) {
    case "critical":
      return "patients.careLevelCritical";
    case "special":
      return "patients.careLevelSpecial";
    default:
      return "patients.careLevelStandard";
  }
}

function routineScheduleTypeKey(type: Routine["schedule_type"]): TranslationKey {
  switch (type) {
    case "medication":
      return "adminPatients.scheduleMedication";
    case "check_in":
      return "adminPatients.scheduleCheckIn";
    case "procedure":
      return "adminPatients.scheduleProcedure";
    case "meal":
      return "adminPatients.scheduleMeal";
    default:
      return "adminPatients.scheduleCheckIn";
  }
}

function routineStatusKey(status: Routine["status"]): TranslationKey {
  switch (status) {
    case "active":
      return "adminPatients.routineStatusActive";
    case "paused":
      return "adminPatients.routineStatusPaused";
    case "completed":
      return "adminPatients.routineStatusCompleted";
    default:
      return "adminPatients.routineStatusActive";
  }
}

export default function AdminPatientsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [patientToDelete, setPatientToDelete] = useState<PatientRow | null>(null);

  const canDeletePatient = user?.role ? hasCapability(user.role, "patients.manage") : false;

  const deletePatientMutation = useMutation({
    mutationFn: (patientId: number) => api.deletePatient(patientId),
    onSuccess: async () => {
      setPatientToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "patients"] });
    },
  });

  // Admin has workspace-wide patient access (no caregiver filtering)
  const patientsQuery = useQuery({
    queryKey: ["admin", "patients", "list"],
    queryFn: () => api.listPatients({ limit: 1000 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["admin", "patients", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 500 }),
  });

  const caregiversQuery = useQuery({
    queryKey: ["admin", "patients", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 1000 }),
  });

  const caregiverAccessQuery = useQuery({
    queryKey: [
      "admin",
      "patients",
      "caregiver-access",
      (caregiversQuery.data ?? []).map((caregiver) => caregiver.id).join(","),
    ],
    queryFn: async () => {
      const caregivers = (caregiversQuery.data ?? []) as CaregiverOut[];
      const entries = await Promise.all(
        caregivers.map(async (caregiver) => {
          const assignments = await api
            .get<CaregiverPatientAccessOut[]>(`/caregivers/${caregiver.id}/patients`)
            .catch(() => []);
          return { caregiver, assignments };
        }),
      );

      const map = new Map<number, string[]>();
      for (const { caregiver, assignments } of entries) {
        const caregiverName = formatCaregiver(caregiver);
        for (const assignment of assignments.filter((item) => item.is_active)) {
          const list = map.get(assignment.patient_id) ?? [];
          if (!list.includes(caregiverName)) {
            list.push(caregiverName);
          }
          map.set(assignment.patient_id, list);
        }
      }

      for (const list of map.values()) {
        list.sort((left, right) => left.localeCompare(right));
      }

      return map;
    },
    enabled: caregiversQuery.isSuccess,
  });

  // Get routines for all patients
  const allRoutines = useMemo((): Routine[] => {
    const schedules = (schedulesQuery.data ?? []) as CareScheduleOut[];

    return schedules.map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      schedule_type: (schedule.schedule_type as Routine["schedule_type"]) || "check_in",
      time: schedule.starts_at,
      frequency: schedule.recurrence_rule || t("adminPatients.freqOnce"),
      assigned_to:
        schedule.assigned_person?.display_name ||
        schedule.assigned_role ||
        t("adminPatients.routineUnassigned"),
      status: (schedule.status as Routine["status"]) || "active",
    }));
  }, [schedulesQuery.data, t]);

  // Get upcoming routines (next 24 hours)
  const upcomingRoutines = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return allRoutines
      .filter((r) => {
        const routineTime = new Date(r.time);
        return routineTime >= now && routineTime <= tomorrow && r.status === "active";
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .slice(0, 10);
  }, [allRoutines]);

  const patientRows = useMemo<PatientRow[]>(() => {
    const source = (patientsQuery.data ?? []) as ListPatientsResponse;
    const q = search.trim().toLowerCase();
    const caregiverMap = caregiverAccessQuery.data ?? new Map<number, string[]>();

    return source
      .filter((patient) => {
        if (!q) return true;
        const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        return fullName.includes(q) || String(patient.id).includes(q);
      })
      .map((patient) => {
        const assignedCaregivers = caregiverMap.get(patient.id) ?? [];
        
        return {
          id: patient.id,
          fullName: `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`,
          careLevel: (patient.care_level as PatientRow["careLevel"]) || "standard",
          roomId: patient.room_id,
          status: patient.is_active ? "active" : "inactive",
          admissionDate: (patient as { created_at?: string | null }).created_at || null,
          lastSeen: null, // updated_at not available in current schema
          assignedCaregivers,
          assignedCaregiversCount: assignedCaregivers.length,
        };
      });
  }, [caregiverAccessQuery.data, patientsQuery.data, search]);

  // Apply quick filters
  const filteredRows = useMemo(() => {
    switch (activeFilter) {
      case "critical":
        return patientRows.filter((p) => p.careLevel === "critical");
      case "unassigned":
        return patientRows.filter((p) => p.roomId === null || p.assignedCaregiversCount === 0);
      case "recent":
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return patientRows.filter((p) => {
          if (!p.admissionDate) return false;
          return new Date(p.admissionDate) >= weekAgo;
        });
      default:
        return patientRows;
    }
  }, [patientRows, activeFilter]);

  // Stats calculations
  const stats = useMemo(() => {
    const total = patientRows.length;
    const critical = patientRows.filter((p) => p.careLevel === "critical").length;
    const unassigned = patientRows.filter((p) => p.roomId === null).length;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recent = patientRows.filter((p) => {
      if (!p.admissionDate) return false;
      return new Date(p.admissionDate) >= weekAgo;
    }).length;

    return { total, critical, unassigned, recent };
  }, [patientRows]);

  const getCareLevelVariant = (level: PatientRow["careLevel"]) => {
    switch (level) {
      case "critical":
        return "destructive";
      case "special":
        return "warning";
      default:
        return "success";
    }
  };

  const getRoutineTypeColor = (type: Routine["schedule_type"]) => {
    switch (type) {
      case "medication":
        return "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/30";
      case "check_in":
        return "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/30";
      case "procedure":
        return "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/30";
      case "meal":
        return "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const columns = useMemo<ColumnDef<PatientRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("patients.colPatient"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {t("patients.recordId")} #{row.original.id}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: t("patients.careLevel"),
        cell: ({ row }) => (
          <Badge variant={getCareLevelVariant(row.original.careLevel)}>
            {t(careLevelTranslationKey(row.original.careLevel))}
          </Badge>
        ),
      },
      {
        accessorKey: "roomId",
        header: t("patients.colRoom"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p>
              {row.original.roomId != null
                ? `${t("patients.roomPrefix")} #${row.original.roomId}`
                : t("patients.unassignedShort")}
            </p>
            {row.original.roomId === null && (
              <Badge variant="outline" className="text-xs">
                {t("patients.needsAssignment")}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "assignedCaregivers",
        header: t("patients.colCaregivers"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p>
              {row.original.assignedCaregivers.length > 0
                ? row.original.assignedCaregivers.join(", ")
                : t("patients.unassignedShort")}
            </p>
            {row.original.assignedCaregiversCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {row.original.assignedCaregiversCount === 1
                  ? t("adminPatients.caregiversAssignedOne")
                  : t("adminPatients.caregiversAssignedMany").replace(
                      "{count}",
                      String(row.original.assignedCaregiversCount),
                    )}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "admissionDate",
        header: t("patients.colAdmission"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p>{row.original.admissionDate ? formatDateTime(row.original.admissionDate) : "-"}</p>
            {row.original.admissionDate && (
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(row.original.admissionDate)}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "lastSeen",
        header: t("patients.colLastUpdated"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p>{row.original.lastSeen ? formatRelativeTime(row.original.lastSeen) : "-"}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("patients.colStatus"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "success" : "outline"}>
            {row.original.status === "active" ? t("patients.statusActive") : t("patients.statusInactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/patients/${row.original.id}`}>{t("patients.viewProfile")}</Link>
            </Button>
            {canDeletePatient ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                aria-label={t("adminPatients.deletePatient")}
                disabled={deletePatientMutation.isPending}
                onClick={() => {
                  deletePatientMutation.reset();
                  setPatientToDelete(row.original);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [t, canDeletePatient, deletePatientMutation.isPending],
  );

  const isLoading =
    patientsQuery.isLoading || schedulesQuery.isLoading || caregiversQuery.isLoading || caregiverAccessQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("patients.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("adminPatients.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/patients/new">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("patients.addNew")}
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          icon={Users}
          label={t("adminPatients.statTotal")}
          value={stats.total}
          tone="info"
        />
        <SummaryStatCard
          icon={Heart}
          label={t("adminPatients.statCritical")}
          value={stats.critical}
          tone={stats.critical > 0 ? "critical" : "success"}
        />
        <SummaryStatCard
          icon={AlertCircle}
          label={t("adminPatients.statUnassignedRooms")}
          value={stats.unassigned}
          tone={stats.unassigned > 0 ? "warning" : "success"}
        />
        <SummaryStatCard
          icon={Calendar}
          label={t("adminPatients.statRecentAdmissions")}
          value={stats.recent}
          tone="info"
        />
      </section>

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground mr-1" />
        <Button
          size="sm"
          variant={activeFilter === "all" ? "default" : "outline"}
          onClick={() => setActiveFilter("all")}
        >
          {t("adminPatients.filterAll")}
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "critical" ? "destructive" : "outline"}
          onClick={() => setActiveFilter("critical")}
        >
          <AlertCircle className="mr-1.5 h-4 w-4" />
          {t("adminPatients.filterCritical")}
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "unassigned" ? "default" : "outline"}
          className={activeFilter === "unassigned" ? "bg-amber-600 hover:bg-amber-700" : ""}
          onClick={() => setActiveFilter("unassigned")}
        >
          <UserCheck className="mr-1.5 h-4 w-4" />
          {t("adminPatients.filterUnassigned")}
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "recent" ? "default" : "outline"}
          onClick={() => setActiveFilter("recent")}
        >
          <Clock className="mr-1.5 h-4 w-4" />
          {t("adminPatients.filterRecent")}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("adminPatients.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="patients" className="space-y-6">
        <TabsList>
          <TabsTrigger value="patients">{t("adminPatients.tabPatients")}</TabsTrigger>
          <TabsTrigger value="routines">
            {t("adminPatients.tabRoutines")}
            {upcomingRoutines.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {upcomingRoutines.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="space-y-6">
          <DataTableCard
            title={t("adminPatients.rosterTitle")}
            description={t("adminPatients.rosterDescription")}
            data={filteredRows}
            columns={columns}
            isLoading={isLoading}
            emptyText={t("adminPatients.emptyRoster")}
            rightSlot={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        </TabsContent>

        <TabsContent value="routines" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("adminPatients.upcomingRoutinesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : upcomingRoutines.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {t("adminPatients.noUpcomingRoutines")}
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {upcomingRoutines.map((routine) => (
                    <Card key={routine.id} className="border-l-4" style={{ borderLeftColor: "var(--border)" }}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium">{routine.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(routine.time)}
                            </p>
                          </div>
                          <Badge className={getRoutineTypeColor(routine.schedule_type)}>
                            {t(routineScheduleTypeKey(routine.schedule_type))}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">{routine.frequency}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">{routine.assigned_to}</span>
                        </div>
                        <Badge variant={routine.status === "active" ? "success" : "outline"}>
                          {t(routineStatusKey(routine.status))}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("adminPatients.allRoutinesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : allRoutines.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {t("adminPatients.noRoutinesDefined")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/55">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColTitle")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColType")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColTime")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColFrequency")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColAssigned")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          {t("adminPatients.routineColStatus")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRoutines.map((routine) => (
                        <tr key={routine.id} className="border-b border-border/70">
                          <td className="px-4 py-3">
                            <p className="font-medium">{routine.title}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={getRoutineTypeColor(routine.schedule_type)}>
                              {t(routineScheduleTypeKey(routine.schedule_type))}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatDateTime(routine.time)}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {routine.frequency}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {routine.assigned_to}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={routine.status === "active" ? "success" : routine.status === "paused" ? "warning" : "outline"}>
                              {t(routineStatusKey(routine.status))}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={patientToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPatientToDelete(null);
            deletePatientMutation.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminPatients.deletePatientDialogTitle")}</DialogTitle>
            <DialogDescription>
              {patientToDelete
                ? t("adminPatients.deletePatientDialogDescription")
                    .replace("{name}", patientToDelete.fullName)
                    .replace("{id}", String(patientToDelete.id))
                : null}
            </DialogDescription>
          </DialogHeader>
          {deletePatientMutation.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("adminPatients.deletePatientError")}
                {deletePatientMutation.error instanceof ApiError
                  ? ` ${deletePatientMutation.error.message}`
                  : deletePatientMutation.error instanceof Error
                    ? ` ${deletePatientMutation.error.message}`
                    : ""}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletePatientMutation.isPending}
              onClick={() => {
                setPatientToDelete(null);
                deletePatientMutation.reset();
              }}
            >
              {t("adminPatients.deletePatientDialogCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePatientMutation.isPending || !patientToDelete}
              onClick={() => {
                if (patientToDelete) {
                  deletePatientMutation.mutate(patientToDelete.id);
                }
              }}
            >
              {deletePatientMutation.isPending
                ? t("adminPatients.deletePatientDeleting")
                : t("adminPatients.deletePatientDialogConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
