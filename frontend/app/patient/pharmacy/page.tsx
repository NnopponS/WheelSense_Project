"use client";
"use no memo";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { PackageCheck, Send } from "lucide-react";
import { z } from "zod";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListPrescriptionsResponse,
  ListPharmacyOrdersResponse,
  RequestPharmacyOrderRequest,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";

const refillRequestSchema = z.object({
  prescriptionId: z.string().refine((value) => value !== EMPTY_SELECT, {
    message: "Select a prescription",
  }),
  pharmacyName: z.string().trim().min(1, "Pharmacy name is required"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  notes: z.string().trim(),
});

type RefillRequestValues = z.infer<typeof refillRequestSchema>;
type RefillRequestInput = z.input<typeof refillRequestSchema>;

type PrescriptionRow = {
  id: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: string;
  status: string;
  createdAt: string;
};

type PharmacyOrderRow = {
  id: number;
  orderNumber: string;
  prescriptionLabel: string;
  pharmacyName: string;
  quantity: number;
  refillsRemaining: number;
  status: string;
  requestedAt: string;
  fulfilledAt: string | null;
};

export default function PatientPharmacyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const toErrorText = (error: unknown): string => {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return t("patient.pharmacy.requestFailed");
  };
  const patientId = user?.patient_id ?? undefined;
  const hasPatientProfile = typeof patientId === "number";

  const prescriptionsQuery = useQuery({
    queryKey: ["patient", "pharmacy", "prescriptions", patientId],
    enabled: hasPatientProfile,
    queryFn: () => api.listPrescriptions({ patient_id: patientId, status: "active" }),
  });

  const ordersQuery = useQuery({
    queryKey: ["patient", "pharmacy", "orders", patientId],
    enabled: hasPatientProfile,
    queryFn: () => api.listPharmacyOrders({ patient_id: patientId }),
  });

  const form = useForm<RefillRequestInput, undefined, RefillRequestValues>({
    resolver: zodResolver(refillRequestSchema),
    defaultValues: {
      prescriptionId: EMPTY_SELECT,
      pharmacyName: t("patient.pharmacy.pharmacyPlaceholder"),
      quantity: 30,
      notes: "",
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (values: RefillRequestValues) => {
      if (!hasPatientProfile) {
        throw new Error(t("patient.pharmacy.noPatientProfileError"));
      }

      const payload = {
        prescription_id: Number(values.prescriptionId),
        pharmacy_name: values.pharmacyName.trim(),
        quantity: values.quantity,
        notes: values.notes.trim(),
      } satisfies RequestPharmacyOrderRequest;

      await api.requestPharmacyOrder(payload);
    },
    onSuccess: async () => {
      form.reset({
        prescriptionId: EMPTY_SELECT,
        pharmacyName: t("patient.pharmacy.pharmacyPlaceholder"),
        quantity: 30,
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["patient", "pharmacy"] });
    },
  });

  const prescriptions = useMemo(
    () => (prescriptionsQuery.data ?? []) as ListPrescriptionsResponse,
    [prescriptionsQuery.data],
  );

  const activePrescriptions = useMemo(
    () => prescriptions.filter((item) => item.status === "active"),
    [prescriptions],
  );

  const prescriptionMap = useMemo(
    () => new Map(activePrescriptions.map((prescription) => [prescription.id, prescription])),
    [activePrescriptions],
  );

  const orders = useMemo(
    () => (ordersQuery.data ?? []) as ListPharmacyOrdersResponse,
    [ordersQuery.data],
  );

  const prescriptionRows = useMemo<PrescriptionRow[]>(() => {
    return activePrescriptions
      .map((item) => ({
        id: item.id,
        medicationName: item.medication_name,
        dosage: item.dosage,
        frequency: item.frequency,
        route: item.route,
        status: item.status,
        createdAt: item.created_at,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [activePrescriptions]);

  const orderRows = useMemo<PharmacyOrderRow[]>(() => {
    return orders
      .map((order) => {
        const prescription =
          order.prescription_id != null ? prescriptionMap.get(order.prescription_id) : null;
        return {
          id: order.id,
          orderNumber: order.order_number,
          prescriptionLabel: prescription
            ? `${prescription.medication_name} • ${prescription.dosage}`
            : order.prescription_id != null
              ? `${t("patient.pharmacy.prescriptionNumber")}${order.prescription_id}`
              : t("patient.pharmacy.unlinkedPrescription"),
          pharmacyName: order.pharmacy_name,
          quantity: order.quantity,
          refillsRemaining: order.refills_remaining,
          status: order.status,
          requestedAt: order.requested_at,
          fulfilledAt: order.fulfilled_at ?? null,
        };
      })
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }, [orders, prescriptionMap, t]);

  const prescriptionColumns = useMemo<ColumnDef<PrescriptionRow>[]>(
    () => [
      {
        accessorKey: "medicationName",
        header: t("patient.pharmacy.colMedication"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.medicationName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.dosage} • {row.original.frequency}
            </p>
          </div>
        ),
      },
      { accessorKey: "route", header: t("patient.pharmacy.colRoute") },
      {
        accessorKey: "status",
        header: t("patient.pharmacy.colStatus"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "createdAt",
        header: t("patient.pharmacy.colCreated"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.createdAt)}
            </p>
          </div>
        ),
      },
    ],
    [t],
  );

  const orderColumns = useMemo<ColumnDef<PharmacyOrderRow>[]>(
    () => [
      {
        accessorKey: "orderNumber",
        header: t("patient.pharmacy.colOrder"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{row.original.prescriptionLabel}</p>
          </div>
        ),
      },
      {
        accessorKey: "pharmacyName",
        header: t("patient.pharmacy.colPharmacy"),
      },
      {
        accessorKey: "quantity",
        header: t("patient.pharmacy.colQuantity"),
      },
      {
        accessorKey: "refillsRemaining",
        header: t("patient.pharmacy.colRefills"),
      },
      {
        accessorKey: "status",
        header: t("patient.pharmacy.colStatus"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "requestedAt",
        header: t("patient.pharmacy.colRequested"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.requestedAt)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.requestedAt)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "fulfilledAt",
        header: t("patient.pharmacy.colFulfilled"),
        cell: ({ row }) => formatDateTime(row.original.fulfilledAt),
      },
    ],
    [t],
  );

  const saveError = requestMutation.error ? toErrorText(requestMutation.error) : null;
  const canRequest = hasPatientProfile && activePrescriptions.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("patient.pharmacy.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("patient.pharmacy.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("patient.pharmacy.requestRefillTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => requestMutation.mutate(values))}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("patient.pharmacy.labelPrescription")}</Label>
                <Controller
                  control={form.control}
                  name="prescriptionId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!hasPatientProfile || activePrescriptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("patient.pharmacy.selectPrescriptionPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>
                          {t("patient.pharmacy.selectPrescriptionPlaceholder")}
                        </SelectItem>
                        {activePrescriptions.map((prescription) => (
                          <SelectItem key={prescription.id} value={String(prescription.id)}>
                            {prescription.medication_name} ({prescription.dosage})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.prescriptionId ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.prescriptionId.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("patient.pharmacy.labelPharmacyName")}</Label>
                <Input
                  {...form.register("pharmacyName")}
                  disabled={!canRequest}
                  placeholder={t("patient.pharmacy.pharmacyPlaceholder")}
                />
                {form.formState.errors.pharmacyName ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.pharmacyName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("patient.pharmacy.labelQuantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  disabled={!canRequest}
                  {...form.register("quantity", { valueAsNumber: true })}
                />
                {form.formState.errors.quantity ? (
                  <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("patient.pharmacy.labelNotes")}</Label>
              <Textarea
                rows={3}
                {...form.register("notes")}
                disabled={!canRequest}
                placeholder={t("patient.pharmacy.notesPlaceholder")}
              />
            </div>

            {!hasPatientProfile ? (
              <p className="text-sm text-muted-foreground">
                {t("patient.pharmacy.noProfileLinked")}
              </p>
            ) : activePrescriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("patient.pharmacy.noActivePrescriptions")}
              </p>
            ) : null}

            {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

            <Button type="submit" disabled={requestMutation.isPending || !canRequest}>
              <Send className="h-4 w-4" />
              {requestMutation.isPending ? t("patient.pharmacy.submitting") : t("patient.pharmacy.requestRefill")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DataTableCard
        title={t("patient.pharmacy.activeRxTitle")}
        description={t("patient.pharmacy.activeRxDesc")}
        data={prescriptionRows}
        columns={prescriptionColumns}
        isLoading={prescriptionsQuery.isLoading}
        emptyText={t("patient.pharmacy.emptyActiveRx")}
        rightSlot={<PackageCheck className="h-4 w-4 text-muted-foreground" />}
      />

      <DataTableCard
        title={t("patient.pharmacy.ordersTitle")}
        description={t("patient.pharmacy.ordersDesc")}
        data={orderRows}
        columns={orderColumns}
        isLoading={ordersQuery.isLoading}
        emptyText={t("patient.pharmacy.emptyOrders")}
        rightSlot={<PackageCheck className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
