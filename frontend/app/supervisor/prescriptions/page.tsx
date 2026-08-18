"use client";
"use no memo";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { Pill, Plus } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { AppPage } from "@/components/layout/AppPage";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  CreatePrescriptionRequest,
  ListPrescriptionsResponse,
  ListSpecialistsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";

const prescriptionFormSchema = z.object({
  patientId: z.string().refine((value) => value !== EMPTY_SELECT, {
    message: "supervisor.prescriptions.selectPatient",
  }),
  specialistId: z.string(),
  medicationName: z.string().trim().min(1, "supervisor.prescriptions.medicationRequired"),
  dosage: z.string().trim().min(1, "supervisor.prescriptions.dosageRequired"),
  frequency: z.string().trim().min(1, "supervisor.prescriptions.frequencyRequired"),
  instructions: z.string().trim(),
});

type PrescriptionFormValues = z.infer<typeof prescriptionFormSchema>;

type PrescriptionRow = {
  id: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  patientName: string;
  specialistId: number | null;
  status: string;
  createdAt: string;
};

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function SupervisorPrescriptionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const prescriptionsQuery = useQuery({
    queryKey: ["supervisor", "prescriptions", "list"],
    queryFn: () => api.listPrescriptions(),
  });

  const patientsQuery = useQuery({
    queryKey: ["supervisor", "prescriptions", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const specialistsQuery = useQuery({
    queryKey: ["supervisor", "prescriptions", "specialists"],
    queryFn: () => api.listSpecialists(),
  });

  const form = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: {
      patientId: EMPTY_SELECT,
      specialistId: EMPTY_SELECT,
      medicationName: "",
      dosage: "",
      frequency: "",
      instructions: "",
    },
  });

  const createPrescriptionMutation = useMutation({
    mutationFn: async (values: PrescriptionFormValues) => {
      const payload = {
        patient_id: Number(values.patientId),
        specialist_id: values.specialistId === EMPTY_SELECT ? null : Number(values.specialistId),
        medication_name: values.medicationName.trim(),
        dosage: values.dosage.trim(),
        frequency: values.frequency.trim(),
        route: "oral",
        instructions: values.instructions.trim(),
        status: "active",
      } satisfies CreatePrescriptionRequest;

      await api.createPrescription(payload);
    },
    onSuccess: async () => {
      form.reset({
        patientId: EMPTY_SELECT,
        specialistId: EMPTY_SELECT,
        medicationName: "",
        dosage: "",
        frequency: "",
        instructions: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "prescriptions", "list"] });
    },
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const specialists = useMemo(
    () => (specialistsQuery.data ?? []) as ListSpecialistsResponse,
    [specialistsQuery.data],
  );
  const prescriptions = useMemo(
    () => (prescriptionsQuery.data ?? []) as ListPrescriptionsResponse,
    [prescriptionsQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const rows = useMemo<PrescriptionRow[]>(() => {
    return prescriptions
      .map((item) => ({
        id: item.id,
        medicationName: item.medication_name,
        dosage: item.dosage,
        frequency: item.frequency,
        patientName: item.patient_id
          ? `${patientMap.get(item.patient_id)?.first_name ?? ""} ${patientMap.get(item.patient_id)?.last_name ?? ""}`.trim() ||
            `${t("clinical.patient.patientIdPrefix")}${item.patient_id}`
          : t("supervisor.prescriptions.noLinkedPatient"),
        specialistId: item.specialist_id ?? null,
        status: item.status,
        createdAt: item.created_at,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [patientMap, prescriptions, t]);

  const columns = useMemo<ColumnDef<PrescriptionRow>[]>(
    () => [
      {
        accessorKey: "medicationName",
        header: t("clinical.table.medication"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.medicationName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.dosage} • {row.original.frequency}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "patientName",
        header: t("clinical.table.patient"),
      },
      {
        accessorKey: "specialistId",
        header: t("clinical.table.specialist"),
        cell: ({ row }) =>
          row.original.specialistId != null ? `#${row.original.specialistId}` : "—",
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => row.original.status === "active"
          ? t("patients.statusActive")
          : row.original.status === "inactive"
            ? t("patients.statusInactive")
            : row.original.status.replace(/_/g, " "),
      },
      {
        accessorKey: "createdAt",
        header: t("clinical.table.created"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  const saveError = createPrescriptionMutation.error
    ? errorText(createPrescriptionMutation.error, t("supervisor.prescriptions.saveError"))
    : null;

  return (
    <AppPage
      title={t("supervisor.prescriptions.pageTitle")}
      description={t("supervisor.prescriptions.pageSubtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/supervisor" },
        { label: t("nav.prescriptions") },
      ]}
    >

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("supervisor.prescriptions.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => createPrescriptionMutation.mutate(values))}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("supervisor.prescriptions.patientLabel")}</Label>
                <Controller
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("supervisor.prescriptions.selectPatient")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>{t("supervisor.prescriptions.selectPatient")}</SelectItem>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={String(patient.id)}>
                            {patient.first_name} {patient.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.patientId ? (
                  <p className="text-sm text-destructive">{t(form.formState.errors.patientId.message as TranslationKey)}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("supervisor.prescriptions.specialistLabel")}</Label>
                <Controller
                  control={form.control}
                  name="specialistId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("supervisor.prescriptions.selectSpecialist")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>{t("supervisor.prescriptions.selectSpecialist")}</SelectItem>
                        {specialists.map((specialist) => (
                          <SelectItem key={specialist.id} value={String(specialist.id)}>
                            {specialist.first_name} {specialist.last_name} ({specialist.specialty})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("supervisor.prescriptions.medicationLabel")}</Label>
                <Input {...form.register("medicationName")} placeholder={t("supervisor.prescriptions.medicationPlaceholder")} />
                {form.formState.errors.medicationName ? (
                  <p className="text-sm text-destructive">{t(form.formState.errors.medicationName.message as TranslationKey)}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("supervisor.prescriptions.dosageLabel")}</Label>
                <Input {...form.register("dosage")} placeholder={t("supervisor.prescriptions.dosagePlaceholder")} />
                {form.formState.errors.dosage ? (
                  <p className="text-sm text-destructive">{t(form.formState.errors.dosage.message as TranslationKey)}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("supervisor.prescriptions.frequencyLabel")}</Label>
                <Input {...form.register("frequency")} placeholder={t("supervisor.prescriptions.frequencyPlaceholder")} />
                {form.formState.errors.frequency ? (
                  <p className="text-sm text-destructive">{t(form.formState.errors.frequency.message as TranslationKey)}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("supervisor.prescriptions.instructionsLabel")}</Label>
              <Textarea rows={3} {...form.register("instructions")} placeholder={t("supervisor.prescriptions.instructionsPlaceholder")} />
            </div>

            {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

            <Button type="submit" disabled={createPrescriptionMutation.isPending}>
              <Plus className="h-4 w-4" />
              {createPrescriptionMutation.isPending ? t("common.saving") : t("supervisor.prescriptions.createAction")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DataTableCard
        title={t("supervisor.prescriptions.listTitle")}
        mobileMode="cards"
        description={t("supervisor.prescriptions.listDesc")}
        data={rows}
        columns={columns}
        isLoading={prescriptionsQuery.isLoading || patientsQuery.isLoading || specialistsQuery.isLoading}
        emptyText={t("supervisor.prescriptions.listEmpty")}
        rightSlot={<Pill className="h-4 w-4 text-muted-foreground" />}
        csvExport={{
          fileNameBase: "wheelsense-supervisor-prescriptions",
          headers: [
            t("supervisor.prescriptions.csvId"),
            t("supervisor.prescriptions.medicationLabel"),
            t("supervisor.prescriptions.dosageLabel"),
            t("supervisor.prescriptions.frequencyLabel"),
            t("supervisor.prescriptions.patientLabel"),
            t("supervisor.prescriptions.csvSpecialistId"),
            t("clinical.table.status"),
            t("clinical.table.created"),
          ],
          getRowValues: (row) => [
            row.id,
            row.medicationName,
            row.dosage,
            row.frequency,
            row.patientName,
            row.specialistId,
            row.status === "active" ? t("patients.statusActive") : row.status === "inactive" ? t("patients.statusInactive") : row.status,
            row.createdAt,
          ],
        }}
      />
    </AppPage>
  );
}

