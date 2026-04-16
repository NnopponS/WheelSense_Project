"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";
import {
  BLOOD_TYPE_OPTIONS,
  CARE_LEVEL_OPTIONS,
  GENDER_OPTIONS,
  MOBILITY_OPTIONS,
  buildEmergencyContactPayload,
  buildPatientCreatePayload,
  createPatientFormDefaultValues,
  patientCreateFormSchema,
  type PatientCreateFormValues,
} from "@/lib/forms/patientForm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

export interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export default function AddPatientModal({
  open,
  onClose,
  onCreated,
}: AddPatientModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const defaultValues = createPatientFormDefaultValues();

  const form = useForm<PatientCreateFormValues>({
    resolver: zodResolver(patientCreateFormSchema),
    defaultValues,
  });

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = form;

  const medicationsFieldArray = useFieldArray({
    control,
    name: "medications",
  });

  const surgeriesFieldArray = useFieldArray({
    control,
    name: "surgeries",
  });

  useEffect(() => {
    if (!open) {
      reset(defaultValues);
    }
  }, [defaultValues, open, reset]);

  const closeModal = () => {
    if (isSubmitting) return;
    reset(defaultValues);
    setFormError("");
    onClose();
  };

  const submit = handleSubmit(async (values) => {
    setFormError("");
    let createdPatientId: number | null = null;
    const emergencyContact = buildEmergencyContactPayload(values);

    try {
      const created = await api.post<Patient>("/patients", buildPatientCreatePayload(values));
      createdPatientId = created.id;

      if (emergencyContact) {
        await api.post(`/patients/${created.id}/contacts`, emergencyContact);
      }

      await onCreated();
      closeModal();
      router.push(`/head-nurse/personnel/${created.id}`);
    } catch (err) {
      if (createdPatientId != null && emergencyContact) {
        try {
          await api.delete(`/patients/${createdPatientId}`);
        } catch {
          // Best-effort cleanup only.
        }
      }

      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.createError"),
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeModal()}>
      <DialogContent className="w-[min(100%-2rem,72rem)]">
        <form onSubmit={submit} className="flex max-h-[88vh] min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t("patients.createTitle")}</DialogTitle>
            <DialogDescription>
              Standardized patient intake form using schema validation and reusable UI primitives.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <FormSection title={t("patients.formSectionIdentity")}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  label={`${t("patients.firstName")} *`}
                  error={errors.firstName?.message}
                >
                  <Input {...register("firstName")} disabled={isSubmitting} />
                </TextField>
                <TextField
                  label={`${t("patients.lastName")} *`}
                  error={errors.lastName?.message}
                >
                  <Input {...register("lastName")} disabled={isSubmitting} />
                </TextField>
                <TextField
                  label={t("patients.dateOfBirth")}
                  error={errors.dateOfBirth?.message}
                >
                  <Input type="date" {...register("dateOfBirth")} disabled={isSubmitting} />
                </TextField>
                <SelectField
                  control={control}
                  name="gender"
                  label={t("patients.gender")}
                  options={GENDER_OPTIONS.map((value) => ({
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
                  disabled={isSubmitting}
                />
                <SelectField
                  control={control}
                  name="careLevel"
                  label={t("patients.careLevel")}
                  options={CARE_LEVEL_OPTIONS.map((value) => ({ value, label: value }))}
                  disabled={isSubmitting}
                />
                <SelectField
                  control={control}
                  name="mobilityType"
                  label={t("patients.mobilityType")}
                  options={MOBILITY_OPTIONS.map((value) => ({ value, label: value }))}
                  disabled={isSubmitting}
                  className="sm:col-span-2"
                />
              </div>
            </FormSection>

            <FormSection title={t("patients.formSectionPhysical")}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TextField label={t("patients.heightCm")} error={errors.heightCm?.message}>
                  <Input
                    inputMode="decimal"
                    placeholder="178"
                    {...register("heightCm")}
                    disabled={isSubmitting}
                  />
                </TextField>
                <TextField label={t("patients.weightKg")} error={errors.weightKg?.message}>
                  <Input
                    inputMode="decimal"
                    placeholder="82"
                    {...register("weightKg")}
                    disabled={isSubmitting}
                  />
                </TextField>
                <SelectField
                  control={control}
                  name="bloodType"
                  label={t("patients.bloodType")}
                  options={BLOOD_TYPE_OPTIONS.map((value) => ({
                    value,
                    label: value || "-",
                  }))}
                  disabled={isSubmitting}
                />
              </div>
            </FormSection>

            <FormSection title={t("patients.formSectionMedical")}>
              <TextField
                label={t("patients.chronicConditionsHint")}
                error={errors.chronicRaw?.message}
              >
                <Textarea
                  {...register("chronicRaw")}
                  placeholder={t("patients.chronicPlaceholder")}
                  disabled={isSubmitting}
                />
              </TextField>
              <TextField
                label={t("patients.allergiesHint")}
                error={errors.allergiesRaw?.message}
              >
                <Textarea
                  {...register("allergiesRaw")}
                  placeholder={t("patients.allergiesPlaceholder")}
                  disabled={isSubmitting}
                />
              </TextField>
            </FormSection>

            <FormSection title={t("patients.formSectionSurgeries")}>
              <div className="space-y-3">
                {surgeriesFieldArray.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-muted-soft p-4 sm:grid-cols-12"
                  >
                    <TextField
                      label={t("patients.surgeryProcedure")}
                      className="sm:col-span-5"
                      error={errors.surgeries?.[index]?.procedure?.message}
                    >
                      <Input
                        {...register(`surgeries.${index}.procedure`)}
                        disabled={isSubmitting}
                      />
                    </TextField>
                    <TextField
                      label={t("patients.surgeryFacility")}
                      className="sm:col-span-4"
                      error={errors.surgeries?.[index]?.facility?.message}
                    >
                      <Input
                        {...register(`surgeries.${index}.facility`)}
                        disabled={isSubmitting}
                      />
                    </TextField>
                    <TextField
                      label={t("patients.surgeryYear")}
                      className="sm:col-span-2"
                      error={errors.surgeries?.[index]?.year?.message}
                    >
                      <Input
                        inputMode="numeric"
                        placeholder="2021"
                        {...register(`surgeries.${index}.year`)}
                        disabled={isSubmitting}
                      />
                    </TextField>
                    <div className="flex items-end justify-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => surgeriesFieldArray.remove(index)}
                        disabled={isSubmitting || surgeriesFieldArray.fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    surgeriesFieldArray.append({ procedure: "", facility: "", year: "" })
                  }
                  disabled={isSubmitting}
                >
                  <Plus className="h-4 w-4" />
                  {t("patients.addSurgeryRow")}
                </Button>
              </div>
            </FormSection>

            <FormSection title={t("patients.formSectionMedications")}>
              <div className="space-y-3">
                {medicationsFieldArray.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-3 rounded-2xl border border-border/70 bg-muted-soft p-4"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <TextField
                        label={t("patients.medName")}
                        error={errors.medications?.[index]?.name?.message}
                      >
                        <Input
                          {...register(`medications.${index}.name`)}
                          disabled={isSubmitting}
                        />
                      </TextField>
                      <TextField
                        label={t("patients.medDosage")}
                        error={errors.medications?.[index]?.dosage?.message}
                      >
                        <Input
                          {...register(`medications.${index}.dosage`)}
                          disabled={isSubmitting}
                        />
                      </TextField>
                      <TextField
                        label={t("patients.medFrequency")}
                        error={errors.medications?.[index]?.frequency?.message}
                      >
                        <Input
                          {...register(`medications.${index}.frequency`)}
                          disabled={isSubmitting}
                        />
                      </TextField>
                    </div>
                    <TextField
                      label={t("patients.medInstructions")}
                      error={errors.medications?.[index]?.instructions?.message}
                    >
                      <Input
                        {...register(`medications.${index}.instructions`)}
                        placeholder={t("patients.medInstructionsPlaceholder")}
                        disabled={isSubmitting}
                      />
                    </TextField>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => medicationsFieldArray.remove(index)}
                        disabled={isSubmitting || medicationsFieldArray.fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("patients.removeRow")}
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    medicationsFieldArray.append({
                      name: "",
                      dosage: "",
                      frequency: "",
                      instructions: "",
                    })
                  }
                  disabled={isSubmitting}
                >
                  <Plus className="h-4 w-4" />
                  {t("patients.addMedicationRow")}
                </Button>
              </div>
            </FormSection>

            <FormSection title={t("patients.formSectionEmergency")}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TextField
                  label={t("patients.ecName")}
                  error={errors.emergencyContactName?.message}
                >
                  <Input {...register("emergencyContactName")} disabled={isSubmitting} />
                </TextField>
                <TextField label={t("patients.ecRelationship")}>
                  <Input
                    {...register("emergencyContactRelationship")}
                    placeholder={t("patients.ecRelationshipPlaceholder")}
                    disabled={isSubmitting}
                  />
                </TextField>
                <TextField
                  label={t("patients.ecPhone")}
                  error={errors.emergencyContactPhone?.message}
                >
                  <Input
                    type="tel"
                    {...register("emergencyContactPhone")}
                    disabled={isSubmitting}
                  />
                </TextField>
              </div>
            </FormSection>

            <FormSection title={t("patients.formSectionNotes")}>
              <TextField label={t("patients.formSectionNotes")} error={errors.notes?.message}>
                <Textarea {...register("notes")} disabled={isSubmitting} />
              </TextField>
            </FormSection>

            {formError ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSubmitting}>
              {t("patients.createCancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : t("patients.createSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="h-px w-full bg-border/70" />
      </div>
      {children}
    </section>
  );
}

function TextField({
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
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  disabled,
  className,
}: {
  control: ReturnType<typeof useForm<PatientCreateFormValues>>["control"];
  name: keyof Pick<
    PatientCreateFormValues,
    "gender" | "careLevel" | "mobilityType" | "bloodType"
  >;
  label: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  className?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField label={label} error={fieldState.error?.message} className={className}>
          <Select
            value={field.value || EMPTY_SELECT_VALUE}
            onValueChange={(value) =>
              field.onChange(value === EMPTY_SELECT_VALUE ? "" : value)
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={`${name}-${option.value || "empty"}`}
                  value={option.value || EMPTY_SELECT_VALUE}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TextField>
      )}
    />
  );
}
