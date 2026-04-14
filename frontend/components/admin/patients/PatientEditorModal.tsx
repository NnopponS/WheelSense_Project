"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { splitList } from "@/lib/patientFormParse";
import type {
  CreatePatientContactRequest,
  CreateUserRequest,
  ListPatientContactsResponse,
  ListUsersResponse,
  PatientOut,
  UpdatePatientRequest,
  UpdateUserRequest,
} from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { type TranslationKey, useTranslation } from "@/lib/i18n";

const EMPTY_SELECT_VALUE = "__empty__";
const NO_ROOM_VALUE = "__no_room__";

const genderOptions = ["", "male", "female", "other"] as const;
const careLevelOptions = ["normal", "special", "critical"] as const;
const mobilityTypeOptions = ["wheelchair", "walker", "independent"] as const;
const bloodTypeOptions = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const accountModeOptions = ["none", "existing", "new"] as const;

type RoomOption = {
  id: number;
  name: string;
  floor_name?: string | null;
};

const roomOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  floor_name: z.string().nullish(),
});

function createPatientEditorSchemas(t: (key: TranslationKey) => string) {
  const editorObjectSchema = z.object({
    firstName: z.string().trim().min(1, t("patients.editorErrFirstName")),
    lastName: z.string().trim().min(1, t("patients.editorErrLastName")),
    dateOfBirth: z.string(),
    gender: z.enum(genderOptions),
    careLevel: z.enum(careLevelOptions),
    mobilityType: z.enum(mobilityTypeOptions),
    bloodType: z.enum(bloodTypeOptions),
    heightCm: z.string(),
    weightKg: z.string(),
    conditionsRaw: z.string(),
    allergiesRaw: z.string(),
    notes: z.string(),
    roomId: z.string(),
    isActive: z.boolean(),
    emergencyContactType: z.string(),
    emergencyContactName: z.string(),
    emergencyContactRelationship: z.string(),
    emergencyContactPhone: z.string(),
    emergencyContactEmail: z.string(),
    emergencyContactNotes: z.string(),
    accountMode: z.enum(accountModeOptions),
    existingUserId: z.number().nullable(),
    newUsername: z.string(),
    newPassword: z.string(),
  });

  const editorBaseSchema = editorObjectSchema.superRefine((value, ctx) => {
    if (value.accountMode === "existing" && !value.existingUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["existingUserId"],
        message: t("patients.editorErrSelectPatientAccount"),
      });
    }

    if (value.accountMode === "new") {
      if (value.newUsername.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newUsername"],
          message: t("patients.editorErrUsernameMin"),
        });
      }
      if (value.newPassword.trim().length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newPassword"],
          message: t("patients.editorErrPasswordMin"),
        });
      }
    }

    const hasEmergencyName = value.emergencyContactName.trim().length > 0;
    const hasEmergencyPhone = value.emergencyContactPhone.trim().length > 0;
    if (hasEmergencyName !== hasEmergencyPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasEmergencyName ? "emergencyContactPhone" : "emergencyContactName"],
        message: t("patients.editorErrEmergencyPair"),
      });
    }
  });

  const patientSectionSchema = editorObjectSchema.pick({
    firstName: true,
    lastName: true,
    dateOfBirth: true,
    gender: true,
    careLevel: true,
    mobilityType: true,
    bloodType: true,
    heightCm: true,
    weightKg: true,
    conditionsRaw: true,
    allergiesRaw: true,
    notes: true,
    roomId: true,
    isActive: true,
  });

  const contactSectionSchema = editorObjectSchema.pick({
    emergencyContactType: true,
    emergencyContactName: true,
    emergencyContactRelationship: true,
    emergencyContactPhone: true,
    emergencyContactEmail: true,
    emergencyContactNotes: true,
  });

  const accountModeSchema = editorObjectSchema
    .pick({
      accountMode: true,
      existingUserId: true,
      newUsername: true,
      newPassword: true,
    })
    .omit({
      existingUserId: true,
      newUsername: true,
      newPassword: true,
    });

  const existingAccountSchema = editorObjectSchema.pick({ existingUserId: true });
  const newAccountSchema = editorObjectSchema.pick({ newUsername: true, newPassword: true });

  return {
    editorBaseSchema,
    patientSectionSchema,
    contactSectionSchema,
    accountModeSchema,
    existingAccountSchema,
    newAccountSchema,
  };
}

type PatientEditorFormValues = z.infer<
  ReturnType<typeof createPatientEditorSchemas>["editorBaseSchema"]
>;

type SaveStage = "idle" | "patient" | "contact" | "account";

export interface PatientEditorModalProps {
  open: boolean;
  patientId: number;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}

function parseNumberOrNull(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roomTitle(room: RoomOption): string {
  return room.floor_name ? `${room.name} - ${room.floor_name}` : room.name;
}

function buildDefaultValues(
  patient: PatientOut,
  contact: ListPatientContactsResponse[number] | null,
  linkedUser: ListUsersResponse[number] | null,
): PatientEditorFormValues {
  return {
    firstName: patient.first_name ?? "",
    lastName: patient.last_name ?? "",
    dateOfBirth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "",
    gender: (patient.gender ?? "") as PatientEditorFormValues["gender"],
    careLevel: (patient.care_level ?? "normal") as PatientEditorFormValues["careLevel"],
    mobilityType: (patient.mobility_type ?? "wheelchair") as PatientEditorFormValues["mobilityType"],
    bloodType: (patient.blood_type ?? "") as PatientEditorFormValues["bloodType"],
    heightCm: patient.height_cm != null ? String(patient.height_cm) : "",
    weightKg: patient.weight_kg != null ? String(patient.weight_kg) : "",
    conditionsRaw: (patient.medical_conditions ?? [])
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join("\n"),
    allergiesRaw: (patient.allergies ?? []).join("\n"),
    notes: patient.notes ?? "",
    roomId: patient.room_id != null ? String(patient.room_id) : NO_ROOM_VALUE,
    isActive: patient.is_active !== false,
    emergencyContactType: contact?.contact_type ?? "emergency",
    emergencyContactName: contact?.name ?? "",
    emergencyContactRelationship: contact?.relationship ?? "",
    emergencyContactPhone: contact?.phone ?? "",
    emergencyContactEmail: contact?.email ?? "",
    emergencyContactNotes: contact?.notes ?? "",
    accountMode: linkedUser ? "existing" : "none",
    existingUserId: linkedUser?.id ?? null,
    newUsername: "",
    newPassword: "",
  };
}

function extractErrorMessage(error: unknown, t: (key: TranslationKey) => string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return t("patients.editorUnexpectedError");
}

export default function PatientEditorModal({
  open,
  patientId,
  onClose,
  onSaved,
}: PatientEditorModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [initializedForOpen, setInitializedForOpen] = useState(false);
  const [saveStage, setSaveStage] = useState<SaveStage>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const schemas = useMemo(() => createPatientEditorSchemas(t), [t]);
  const resolver = useMemo(() => zodResolver(schemas.editorBaseSchema), [schemas]);

  const form = useForm<PatientEditorFormValues>({
    resolver,
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: "",
      careLevel: "normal",
      mobilityType: "wheelchair",
      bloodType: "",
      heightCm: "",
      weightKg: "",
      conditionsRaw: "",
      allergiesRaw: "",
      notes: "",
      roomId: NO_ROOM_VALUE,
      isActive: true,
      emergencyContactType: "emergency",
      emergencyContactName: "",
      emergencyContactRelationship: "",
      emergencyContactPhone: "",
      emergencyContactEmail: "",
      emergencyContactNotes: "",
      accountMode: "none",
      existingUserId: null,
      newUsername: "",
      newPassword: "",
    },
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = form;

  const patientQuery = useQuery({
    queryKey: ["patient-editor", "patient", patientId],
    enabled: open,
    queryFn: async () => api.getPatient(patientId),
  });

  const contactsQuery = useQuery({
    queryKey: ["patient-editor", "contacts", patientId],
    enabled: open,
    queryFn: async () => api.listPatientContacts(patientId),
    initialData: [] as ListPatientContactsResponse,
  });

  const usersQuery = useQuery({
    queryKey: ["patient-editor", "users"],
    enabled: open,
    queryFn: async () => api.listUsers(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const roomsQuery = useQuery({
    queryKey: ["patient-editor", "rooms"],
    enabled: open,
    queryFn: async () => {
      const raw = await api.listRooms();
      if (!Array.isArray(raw)) return [] as RoomOption[];
      return raw
        .map((item) => roomOptionSchema.safeParse(item))
        .filter((item) => item.success)
        .map((item) => item.data);
    },
    initialData: [] as RoomOption[],
  });

  const usersRows = useMemo(
    () => usersQuery.data ?? ([] as ListUsersResponse),
    [usersQuery.data],
  );

  const linkedUser = useMemo(() => {
    return usersRows.find((user) => user.patient_id === patientId) ?? null;
  }, [patientId, usersRows]);

  const contact = useMemo(() => {
    const rows = contactsQuery.data;
    return rows.find((row) => row.is_primary) ?? rows.find((row) => row.contact_type === "emergency") ?? rows[0] ?? null;
  }, [contactsQuery.data]);

  const candidateUsers = useMemo(() => {
    const linkedUserId = linkedUser?.id ?? null;
    return usersRows.filter((user) => {
      if (user.id === linkedUserId) return true;
      return user.role === "patient" && user.patient_id == null;
    });
  }, [linkedUser?.id, usersRows]);

  useEffect(() => {
    if (!open) {
      setInitializedForOpen(false);
      setSaveError(null);
      setSaveStage("idle");
      return;
    }

    if (initializedForOpen) return;
    if (!patientQuery.data) return;
    // Wait for workspace users (including refetch-on-open) so linked portal account is not stale.
    if (usersQuery.isLoading || usersQuery.isFetching) return;

    reset(buildDefaultValues(patientQuery.data, contact, linkedUser));
    setInitializedForOpen(true);
  }, [
    contact,
    initializedForOpen,
    linkedUser,
    open,
    patientQuery.data,
    reset,
    usersQuery.isFetching,
    usersQuery.isLoading,
  ]);

  const updatePatientMutation = useMutation({
    mutationFn: async (payload: UpdatePatientRequest) => api.patchPatient(patientId, payload),
  });

  const syncContactMutation = useMutation({
    mutationFn: async (payload: {
      existingContactId: number | null;
      nextContact: CreatePatientContactRequest | null;
    }) => {
      if (payload.nextContact && payload.existingContactId) {
        await api.updatePatientContact(patientId, payload.existingContactId, payload.nextContact);
        return;
      }
      if (payload.nextContact && !payload.existingContactId) {
        await api.createPatientContact(patientId, payload.nextContact);
        return;
      }
      if (!payload.nextContact && payload.existingContactId) {
        await api.deletePatientContact(patientId, payload.existingContactId);
      }
    },
  });

  const syncAccountMutation = useMutation({
    mutationFn: async (values: PatientEditorFormValues) => {
      const accountMode = schemas.accountModeSchema.parse(values).accountMode;
      const currentLinkedUserId = linkedUser?.id ?? null;

      if (accountMode === "none") {
        if (currentLinkedUserId) {
          const unlinkPayload = { patient_id: null } satisfies UpdateUserRequest;
          await api.updateUser(currentLinkedUserId, unlinkPayload);
        }
        return;
      }

      if (accountMode === "existing") {
        const parsed = schemas.existingAccountSchema.parse(values);
        const selectedUserId = parsed.existingUserId;
        if (!selectedUserId) {
          throw new Error(t("patients.editorErrSelectExisting"));
        }

        const selectedUser = candidateUsers.find((user) => user.id === selectedUserId);
        if (!selectedUser) {
          throw new Error(t("patients.editorErrAccountNotFound"));
        }
        if (selectedUser.role !== "patient" && selectedUser.id !== currentLinkedUserId) {
          throw new Error(t("patients.editorErrOnlyPatientRole"));
        }

        if (currentLinkedUserId && currentLinkedUserId !== selectedUserId) {
          const unlinkPayload = { patient_id: null } satisfies UpdateUserRequest;
          await api.updateUser(currentLinkedUserId, unlinkPayload);
        }

        const linkPayload = { patient_id: patientId } satisfies UpdateUserRequest;
        await api.updateUser(selectedUserId, linkPayload);
        return;
      }

      const parsed = schemas.newAccountSchema.parse(values);
      if (currentLinkedUserId) {
        const unlinkPayload = { patient_id: null } satisfies UpdateUserRequest;
        await api.updateUser(currentLinkedUserId, unlinkPayload);
      }

      const createPayload = {
        username: parsed.newUsername.trim(),
        password: parsed.newPassword.trim(),
        role: "patient",
        is_active: true,
        patient_id: patientId,
        profile_image_url: "",
      } satisfies CreateUserRequest;
      await api.createUser(createPayload);
    },
  });

  const isSaving =
    updatePatientMutation.isPending ||
    syncContactMutation.isPending ||
    syncAccountMutation.isPending;

  const loadingState =
    patientQuery.isLoading || contactsQuery.isLoading || usersQuery.isLoading || roomsQuery.isLoading;

  const accountMode = watch("accountMode");

  const saveLabel =
    saveStage === "patient"
      ? t("patients.editorSavingPatient")
      : saveStage === "contact"
        ? t("patients.editorSavingContact")
        : saveStage === "account"
          ? t("patients.editorSavingAccount")
          : t("patients.editorSaveChanges");

  const submit = handleSubmit(async (values) => {
    setSaveError(null);

    try {
      setSaveStage("patient");
      const patientValues = schemas.patientSectionSchema.parse(values);
      const patientPayload = {
        first_name: patientValues.firstName.trim(),
        last_name: patientValues.lastName.trim(),
        nickname: "",
        date_of_birth: patientValues.dateOfBirth.trim() || null,
        gender: patientValues.gender,
        care_level: patientValues.careLevel,
        mobility_type: patientValues.mobilityType,
        blood_type: patientValues.bloodType,
        height_cm: parseNumberOrNull(patientValues.heightCm),
        weight_kg: parseNumberOrNull(patientValues.weightKg),
        medical_conditions: splitList(patientValues.conditionsRaw),
        allergies: splitList(patientValues.allergiesRaw),
        notes: patientValues.notes.trim(),
        room_id:
          patientValues.roomId === NO_ROOM_VALUE || patientValues.roomId.trim() === ""
            ? null
            : Number(patientValues.roomId),
        is_active: patientValues.isActive,
      } satisfies UpdatePatientRequest;
      await updatePatientMutation.mutateAsync(patientPayload);

      setSaveStage("contact");
      const contactValues = schemas.contactSectionSchema.parse(values);
      const hasContact =
        contactValues.emergencyContactName.trim().length > 0 &&
        contactValues.emergencyContactPhone.trim().length > 0;

      const nextContact = hasContact
        ? ({
            contact_type: contactValues.emergencyContactType.trim() || "emergency",
            name: contactValues.emergencyContactName.trim(),
            relationship: contactValues.emergencyContactRelationship.trim(),
            phone: contactValues.emergencyContactPhone.trim(),
            email: contactValues.emergencyContactEmail.trim(),
            notes: contactValues.emergencyContactNotes.trim(),
            is_primary: true,
          } satisfies CreatePatientContactRequest)
        : null;

      await syncContactMutation.mutateAsync({
        existingContactId: contact?.id ?? null,
        nextContact,
      });

      setSaveStage("account");
      await syncAccountMutation.mutateAsync(values);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patient-editor", "patient", patientId] }),
        queryClient.invalidateQueries({ queryKey: ["patient-editor", "contacts", patientId] }),
        queryClient.invalidateQueries({ queryKey: ["patient-editor", "users"] }),
      ]);

      if (onSaved) {
        await onSaved();
      }
      onClose();
    } catch (error) {
      setSaveError(extractErrorMessage(error, t));
    } finally {
      setSaveStage("idle");
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent className="w-[min(100%-2rem,64rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("patients.editorTitle")}</DialogTitle>
          <DialogDescription>{t("patients.editorDescription")}</DialogDescription>
        </DialogHeader>

        {loadingState ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("patients.editorLoading")}</div>
        ) : null}

        {!loadingState && patientQuery.data ? (
          <form className="space-y-5" onSubmit={submit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("patients.editorSectionProfile")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label={t("patients.firstName")} error={errors.firstName?.message}>
                  <Input {...register("firstName")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.lastName")} error={errors.lastName?.message}>
                  <Input {...register("lastName")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.dateOfBirth")} error={errors.dateOfBirth?.message}>
                  <Input type="date" {...register("dateOfBirth")} disabled={isSaving} />
                </Field>
                <SelectField
                  control={control}
                  name="gender"
                  label={t("patients.gender")}
                  disabled={isSaving}
                  options={genderOptions.map((value) => ({
                    value,
                    label:
                      value === ""
                        ? t("patients.genderUnset")
                        : value === "male"
                          ? t("patients.genderMale")
                          : value === "female"
                            ? t("patients.genderFemale")
                            : t("patients.genderOther"),
                  }))}
                />
                <SelectField
                  control={control}
                  name="careLevel"
                  label={t("patients.careLevel")}
                  disabled={isSaving}
                  options={careLevelOptions.map((value) => ({
                    value,
                    label:
                      value === "normal"
                        ? t("patients.careLevelNormal")
                        : value === "special"
                          ? t("patients.careLevelSpecial")
                          : t("patients.careLevelCritical"),
                  }))}
                />
                <SelectField
                  control={control}
                  name="mobilityType"
                  label={t("patients.mobilityType")}
                  disabled={isSaving}
                  options={mobilityTypeOptions.map((value) => ({
                    value,
                    label:
                      value === "wheelchair"
                        ? t("patients.mobilityWheelchair")
                        : value === "walker"
                          ? t("patients.mobilityWalker")
                          : t("patients.mobilityIndependent"),
                  }))}
                />
                <SelectField
                  control={control}
                  name="bloodType"
                  label={t("patients.bloodType")}
                  disabled={isSaving}
                  options={bloodTypeOptions.map((value) => ({ value, label: value || "-" }))}
                />
                <Field label={t("patients.heightCm")} error={errors.heightCm?.message}>
                  <Input inputMode="decimal" {...register("heightCm")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.weightKg")} error={errors.weightKg?.message}>
                  <Input inputMode="decimal" {...register("weightKg")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.room")} error={errors.roomId?.message}>
                  <Controller
                    control={control}
                    name="roomId"
                    render={({ field }) => (
                      <Select
                        value={field.value || NO_ROOM_VALUE}
                        onValueChange={field.onChange}
                        disabled={isSaving}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("patients.editorSelectRoom")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROOM_VALUE}>{t("patients.noRoom")}</SelectItem>
                          {roomsQuery.data.map((room) => (
                            <SelectItem key={room.id} value={String(room.id)}>
                              {roomTitle(room)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label={t("patients.editorRecordStatus")} error={errors.isActive?.message}>
                  <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                      <Select
                        value={field.value ? "active" : "inactive"}
                        onValueChange={(value) => field.onChange(value === "active")}
                        disabled={isSaving}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t("patients.statusActive")}</SelectItem>
                          <SelectItem value="inactive">{t("patients.statusInactive")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field
                  label={t("patients.sectionChronic")}
                  hint={t("patients.chronicConditionsHint")}
                  error={errors.conditionsRaw?.message}
                  className="sm:col-span-2"
                >
                  <Textarea
                    rows={4}
                    placeholder={t("patients.chronicPlaceholder")}
                    {...register("conditionsRaw")}
                    disabled={isSaving}
                  />
                </Field>
                <Field
                  label={t("patients.sectionAllergies")}
                  hint={t("patients.allergiesHint")}
                  error={errors.allergiesRaw?.message}
                  className="sm:col-span-2"
                >
                  <Textarea
                    rows={4}
                    placeholder={t("patients.allergiesPlaceholder")}
                    {...register("allergiesRaw")}
                    disabled={isSaving}
                  />
                </Field>
                <Field label={t("patients.formSectionNotes")} error={errors.notes?.message} className="sm:col-span-2">
                  <Textarea rows={4} {...register("notes")} disabled={isSaving} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("patients.editorSectionEmergency")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label={t("patients.contactType")} error={errors.emergencyContactType?.message}>
                  <Input {...register("emergencyContactType")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.ecName")} error={errors.emergencyContactName?.message}>
                  <Input {...register("emergencyContactName")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.ecRelationship")} error={errors.emergencyContactRelationship?.message}>
                  <Input {...register("emergencyContactRelationship")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.ecPhone")} error={errors.emergencyContactPhone?.message}>
                  <Input {...register("emergencyContactPhone")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.ecEmail")} error={errors.emergencyContactEmail?.message}>
                  <Input {...register("emergencyContactEmail")} disabled={isSaving} />
                </Field>
                <Field label={t("patients.ecContactNotes")} error={errors.emergencyContactNotes?.message}>
                  <Input {...register("emergencyContactNotes")} disabled={isSaving} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("patients.editorSectionPortal")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {t("patients.editorLinkedUserPrefix")}:{" "}
                  {linkedUser ? `${linkedUser.username} (${linkedUser.role})` : t("patients.editorLinkedUserNone")}
                </div>

                <Field label={t("patients.accountMode")} error={errors.accountMode?.message}>
                  <Controller
                    control={control}
                    name="accountMode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("patients.accountModeUnlink")}</SelectItem>
                          <SelectItem value="existing">{t("patients.accountModeLinkExisting")}</SelectItem>
                          <SelectItem value="new">{t("patients.accountModeCreateNew")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                {accountMode === "existing" ? (
                  <Field label={t("patients.editorPatientAccount")} error={errors.existingUserId?.message}>
                    <Controller
                      control={control}
                      name="existingUserId"
                      render={({ field }) => (
                        <Select
                          value={field.value != null ? String(field.value) : EMPTY_SELECT_VALUE}
                          onValueChange={(value) =>
                            field.onChange(value === EMPTY_SELECT_VALUE ? null : Number(value))
                          }
                          disabled={isSaving}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("patients.editorSelectAccountPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SELECT_VALUE}>
                              {t("patients.editorSelectAccountPlaceholder")}
                            </SelectItem>
                            {candidateUsers.map((user) => (
                              <SelectItem key={user.id} value={String(user.id)}>
                                {user.username} ({user.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                ) : null}

                {accountMode === "new" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("auth.username")} error={errors.newUsername?.message}>
                      <Input {...register("newUsername")} disabled={isSaving} />
                    </Field>
                    <Field label={t("auth.password")} error={errors.newPassword?.message}>
                      <Input type="password" {...register("newPassword")} disabled={isSaving} />
                    </Field>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {saveError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {saveError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                {t("patients.editorCancel")}
              </Button>
              <Button type="submit" disabled={isSaving || loadingState || !patientQuery.data}>
                {isSaving ? saveLabel : t("patients.editorSaveChanges")}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  disabled,
}: {
  control: ReturnType<typeof useForm<PatientEditorFormValues>>["control"];
  name: "gender" | "careLevel" | "mobilityType" | "bloodType";
  label: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} error={fieldState.error?.message}>
          <Select
            value={field.value || EMPTY_SELECT_VALUE}
            onValueChange={(value) => field.onChange(value === EMPTY_SELECT_VALUE ? "" : value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={`${name}-${option.value || EMPTY_SELECT_VALUE}`}
                  value={option.value || EMPTY_SELECT_VALUE}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}
