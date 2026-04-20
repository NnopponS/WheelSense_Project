"use client";
"use no memo";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { Plus, Stethoscope } from "lucide-react";
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
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type {
  CreateSpecialistRequest,
  ListSpecialistsResponse,
} from "@/lib/api/task-scope-types";

const specialistSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  specialty: z.string().trim().min(1, "Specialty is required"),
  licenseNumber: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim().email("Email is invalid").or(z.literal("")),
  notes: z.string().trim(),
  isActive: z.enum(["true", "false"]),
});

type SpecialistFormValues = z.infer<typeof specialistSchema>;

type SpecialistRow = {
  id: number;
  fullName: string;
  specialty: string;
  licenseNumber: string | null;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Failed to create specialist.";
}

export default function HeadNurseSpecialistsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const specialistsQuery = useQuery({
    queryKey: ["head-nurse", "specialists", "list"],
    queryFn: () => api.listSpecialists(),
  });

  const form = useForm<SpecialistFormValues>({
    resolver: zodResolver(specialistSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      specialty: "",
      licenseNumber: "",
      phone: "",
      email: "",
      notes: "",
      isActive: "true",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: SpecialistFormValues) => {
      const payload = {
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        specialty: values.specialty.trim(),
        license_number: values.licenseNumber.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        notes: values.notes.trim(),
        is_active: values.isActive === "true",
      } satisfies CreateSpecialistRequest;

      await api.createSpecialist(payload);
    },
    onSuccess: async () => {
      form.reset({
        firstName: "",
        lastName: "",
        specialty: "",
        licenseNumber: "",
        phone: "",
        email: "",
        notes: "",
        isActive: "true",
      });
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "specialists"] });
    },
  });

  const specialists = useMemo(
    () => (specialistsQuery.data ?? []) as ListSpecialistsResponse,
    [specialistsQuery.data],
  );

  const rows = useMemo<SpecialistRow[]>(() => {
    return specialists.map((item) => ({
      id: item.id,
      fullName: `${item.first_name} ${item.last_name}`.trim(),
      specialty: item.specialty,
      licenseNumber: item.license_number ?? null,
      phone: item.phone ?? null,
      email: item.email ?? null,
      status: item.is_active ? "active" : "inactive",
    }));
  }, [specialists]);

  const columns = useMemo<ColumnDef<SpecialistRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("clinical.table.specialist"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-sm text-muted-foreground">{row.original.specialty}</p>
          </div>
        ),
      },
      {
        accessorKey: "licenseNumber",
        header: t("clinical.table.license"),
        cell: ({ row }) => row.original.licenseNumber || "-",
      },
      {
        accessorKey: "phone",
        header: t("clinical.table.phone"),
        cell: ({ row }) => row.original.phone || "-",
      },
      {
        accessorKey: "email",
        header: t("clinical.table.email"),
        cell: ({ row }) => row.original.email || "-",
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "success" : "outline"}>
            {row.original.status === "active"
              ? t("clinical.recordStatus.activeBadge")
              : t("clinical.recordStatus.inactiveBadge")}
          </Badge>
        ),
      },
    ],
    [t],
  );

  const saveError = createMutation.error ? errorText(createMutation.error) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("headNurse.specialists.pageTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("headNurse.specialists.pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("headNurse.specialists.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>{t("headNurse.specialists.firstNameLabel")}</Label>
                <Input {...form.register("firstName")} placeholder={t("headNurse.specialists.firstNamePlaceholder")} />
                {form.formState.errors.firstName ? (
                  <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.specialists.lastNameLabel")}</Label>
                <Input {...form.register("lastName")} placeholder={t("headNurse.specialists.lastNamePlaceholder")} />
                {form.formState.errors.lastName ? (
                  <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.specialists.specialtyLabel")}</Label>
                <Input {...form.register("specialty")} placeholder={t("headNurse.specialists.specialtyPlaceholder")} />
                {form.formState.errors.specialty ? (
                  <p className="text-sm text-destructive">{form.formState.errors.specialty.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.specialists.statusLabel")}</Label>
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{t("headNurse.specialists.statusActive")}</SelectItem>
                        <SelectItem value="false">{t("headNurse.specialists.statusInactive")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.specialists.licenseLabel")}</Label>
                <Input {...form.register("licenseNumber")} placeholder={t("headNurse.specialists.licensePlaceholder")} />
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.specialists.phoneLabel")}</Label>
                <Input {...form.register("phone")} placeholder={t("headNurse.specialists.phonePlaceholder")} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("headNurse.specialists.emailLabel")}</Label>
                <Input {...form.register("email")} placeholder={t("headNurse.specialists.emailPlaceholder")} />
                {form.formState.errors.email ? (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("headNurse.specialists.notesLabel")}</Label>
              <Textarea rows={3} {...form.register("notes")} placeholder={t("headNurse.specialists.notesPlaceholder")} />
            </div>

            {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

            <Button type="submit" disabled={createMutation.isPending}>
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? "Saving..." : "Add specialist"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DataTableCard
        title={t("headNurse.specialists.listTitle")}
        description={t("headNurse.specialists.listDesc")}
        data={rows}
        columns={columns}
        isLoading={specialistsQuery.isLoading}
        emptyText={t("headNurse.specialists.listEmpty")}
        rightSlot={<Stethoscope className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
