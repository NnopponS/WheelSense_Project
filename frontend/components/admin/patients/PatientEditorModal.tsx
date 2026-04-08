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

const editorObjectSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  nickname: z.string(),
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
      message: "Select an existing patient account",
    });
  }

  if (value.accountMode === "new") {
    if (value.newUsername.trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newUsername"],
        message: "Username must be at least 3 characters",
      });
    }
    if (value.newPassword.trim().length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "Password must be at least 6 characters",
      });
    }
  }

  const hasEmergencyName = value.emergencyContactName.trim().length > 0;
  const hasEmergencyPhone = value.emergencyContactPhone.trim().length > 0;
  if (hasEmergencyName !== hasEmergencyPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasEmergencyName ? "emergencyContactPhone" : "emergencyContactName"],
      message: "Emergency contact name and phone must be filled together",
    });
  }
});

const patientSectionSchema = editorObjectSchema.pick({
  firstName: true,
  lastName: true,
  nickname: true,
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

type PatientEditorFormValues = z.infer<typeof editorBaseSchema>;

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
    nickname: patient.nickname ?? "",
    dateOfBirth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "",
    gender: (patient.gender ?? "") as PatientEditorFormValues["gender"],
    careLevel: (patient.care_level ?? "normal") as PatientEditorFormValues["careLevel"],
    mobilityType: (patient.mobility_type ?? "wheelchair") as PatientEditorFormValues["mobilityType"],
    bloodType: (patient.blood_type ?? "") as PatientEditorFormValues["bloodType"],
    heightCm: patient.height_cm != null ? String(patient.height_cm) : "",
    weightKg: patient.weight_kg != null ? String(patient.weight_kg) : "",
    conditionsRaw: (patient.medical_conditions ?? [])
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(", "),
    allergiesRaw: (patient.allergies ?? []).join(", "),
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

function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export default function PatientEditorModal({
  open,
  patientId,
  onClose,
  onSaved,
}: PatientEditorModalProps) {
  const queryClient = useQueryClient();
  const [initializedForOpen, setInitializedForOpen] = useState(false);
  const [saveStage, setSaveStage] = useState<SaveStage>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useForm<PatientEditorFormValues>({
    resolver: zodResolver(editorBaseSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      nickname: "",
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
    initialData: [] as ListUsersResponse,
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

  const linkedUser = useMemo(() => {
    return usersQuery.data.find((user) => user.patient_id === patientId) ?? null;
  }, [patientId, usersQuery.data]);

  const contact = useMemo(() => {
    const rows = contactsQuery.data;
    return rows.find((row) => row.is_primary) ?? rows.find((row) => row.contact_type === "emergency") ?? rows[0] ?? null;
  }, [contactsQuery.data]);

  const candidateUsers = useMemo(() => {
    const linkedUserId = linkedUser?.id ?? null;
    return usersQuery.data.filter((user) => {
      if (user.id === linkedUserId) return true;
      return user.role === "patient" && user.patient_id == null;
    });
  }, [linkedUser?.id, usersQuery.data]);

  useEffect(() => {
    if (!open) {
      setInitializedForOpen(false);
      setSaveError(null);
      setSaveStage("idle");
      return;
    }

    if (initializedForOpen) return;
    if (!patientQuery.data) return;

    reset(buildDefaultValues(patientQuery.data, contact, linkedUser));
    setInitializedForOpen(true);
  }, [
    contact,
    initializedForOpen,
    linkedUser,
    open,
    patientQuery.data,
    reset,
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
      const accountMode = accountModeSchema.parse(values).accountMode;
      const currentLinkedUserId = linkedUser?.id ?? null;

      if (accountMode === "none") {
        if (currentLinkedUserId) {
          const unlinkPayload = { patient_id: null } satisfies UpdateUserRequest;
          await api.updateUser(currentLinkedUserId, unlinkPayload);
        }
        return;
      }

      if (accountMode === "existing") {
        const parsed = existingAccountSchema.parse(values);
        const selectedUserId = parsed.existingUserId;
        if (!selectedUserId) {
          throw new Error("Select an existing patient account");
        }

        const selectedUser = candidateUsers.find((user) => user.id === selectedUserId);
        if (!selectedUser) {
          throw new Error("Selected account was not found");
        }
        if (selectedUser.role !== "patient" && selectedUser.id !== currentLinkedUserId) {
          throw new Error("Only patient role accounts can be linked");
        }

        if (currentLinkedUserId && currentLinkedUserId !== selectedUserId) {
          const unlinkPayload = { patient_id: null } satisfies UpdateUserRequest;
          await api.updateUser(currentLinkedUserId, unlinkPayload);
        }

        const linkPayload = { patient_id: patientId } satisfies UpdateUserRequest;
        await api.updateUser(selectedUserId, linkPayload);
        return;
      }

      const parsed = newAccountSchema.parse(values);
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
      ? "Saving patient..."
      : saveStage === "contact"
        ? "Saving contact..."
        : saveStage === "account"
          ? "Saving account link..."
          : "Save changes";

  const submit = handleSubmit(async (values) => {
    setSaveError(null);

    try {
      setSaveStage("patient");
      const patientValues = patientSectionSchema.parse(values);
      const patientPayload = {
        first_name: patientValues.firstName.trim(),
        last_name: patientValues.lastName.trim(),
        nickname: patientValues.nickname.trim(),
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
      const contactValues = contactSectionSchema.parse(values);
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
      setSaveError(extractErrorMessage(error));
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
          <DialogTitle>Edit Patient</DialogTitle>
          <DialogDescription>
            Update profile, emergency contact, and linked portal account.
          </DialogDescription>
        </DialogHeader>

        {loadingState ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading patient data...</div>
        ) : null}

        {!loadingState && patientQuery.data ? (
          <form className="space-y-5" onSubmit={submit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Patient Profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" error={errors.firstName?.message}>
                  <Input {...register("firstName")} disabled={isSaving} />
                </Field>
                <Field label="Last name" error={errors.lastName?.message}>
                  <Input {...register("lastName")} disabled={isSaving} />
                </Field>
                <Field label="Nickname" error={errors.nickname?.message}>
                  <Input {...register("nickname")} disabled={isSaving} />
                </Field>
                <Field label="Date of birth" error={errors.dateOfBirth?.message}>
                  <Input type="date" {...register("dateOfBirth")} disabled={isSaving} />
                </Field>
                <SelectField
                  control={control}
                  name="gender"
                  label="Gender"
                  disabled={isSaving}
                  options={genderOptions.map((value) => ({
                    value,
                    label: value || "Not set",
                  }))}
                />
                <SelectField
                  control={control}
                  name="careLevel"
                  label="Care level"
                  disabled={isSaving}
                  options={careLevelOptions.map((value) => ({ value, label: value }))}
                />
                <SelectField
                  control={control}
                  name="mobilityType"
                  label="Mobility type"
                  disabled={isSaving}
                  options={mobilityTypeOptions.map((value) => ({ value, label: value }))}
                />
                <SelectField
                  control={control}
                  name="bloodType"
                  label="Blood type"
                  disabled={isSaving}
                  options={bloodTypeOptions.map((value) => ({ value, label: value || "-" }))}
                />
                <Field label="Height (cm)" error={errors.heightCm?.message}>
                  <Input inputMode="decimal" {...register("heightCm")} disabled={isSaving} />
                </Field>
                <Field label="Weight (kg)" error={errors.weightKg?.message}>
                  <Input inputMode="decimal" {...register("weightKg")} disabled={isSaving} />
                </Field>
                <Field label="Room" error={errors.roomId?.message}>
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
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROOM_VALUE}>No room assigned</SelectItem>
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
                <Field label="Record status" error={errors.isActive?.message}>
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
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Medical conditions (comma-separated)" error={errors.conditionsRaw?.message} className="sm:col-span-2">
                  <Textarea rows={3} {...register("conditionsRaw")} disabled={isSaving} />
                </Field>
                <Field label="Allergies (comma-separated)" error={errors.allergiesRaw?.message} className="sm:col-span-2">
                  <Textarea rows={3} {...register("allergiesRaw")} disabled={isSaving} />
                </Field>
                <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
                  <Textarea rows={4} {...register("notes")} disabled={isSaving} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact type" error={errors.emergencyContactType?.message}>
                  <Input {...register("emergencyContactType")} disabled={isSaving} />
                </Field>
                <Field label="Name" error={errors.emergencyContactName?.message}>
                  <Input {...register("emergencyContactName")} disabled={isSaving} />
                </Field>
                <Field label="Relationship" error={errors.emergencyContactRelationship?.message}>
                  <Input {...register("emergencyContactRelationship")} disabled={isSaving} />
                </Field>
                <Field label="Phone" error={errors.emergencyContactPhone?.message}>
                  <Input {...register("emergencyContactPhone")} disabled={isSaving} />
                </Field>
                <Field label="Email" error={errors.emergencyContactEmail?.message}>
                  <Input {...register("emergencyContactEmail")} disabled={isSaving} />
                </Field>
                <Field label="Notes" error={errors.emergencyContactNotes?.message}>
                  <Input {...register("emergencyContactNotes")} disabled={isSaving} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portal Account Linking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Current linked user: {linkedUser ? `${linkedUser.username} (${linkedUser.role})` : "none"}
                </div>

                <Field label="Account mode" error={errors.accountMode?.message}>
                  <Controller
                    control={control}
                    name="accountMode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unlink account</SelectItem>
                          <SelectItem value="existing">Link existing account</SelectItem>
                          <SelectItem value="new">Create new account</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                {accountMode === "existing" ? (
                  <Field label="Patient account" error={errors.existingUserId?.message}>
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
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SELECT_VALUE}>Select account</SelectItem>
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
                    <Field label="Username" error={errors.newUsername?.message}>
                      <Input {...register("newUsername")} disabled={isSaving} />
                    </Field>
                    <Field label="Password" error={errors.newPassword?.message}>
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
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || loadingState || !patientQuery.data}>
                {isSaving ? saveLabel : "Save changes"}
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
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
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
