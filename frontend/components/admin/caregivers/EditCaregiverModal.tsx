"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import type { Caregiver } from "@/lib/types";
import { X, Pencil, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  caregiver: Caregiver | null;
  onClose: () => void;
  onSaved: (updated: Caregiver) => void;
};

type CaregiverRole = "admin" | "caregiver" | "head_caregiver";
type CaregiverDepartment = "nursing" | "rehab" | "pharmacy" | "operations" | "support";
type EmploymentType = "full_time" | "part_time" | "contract" | "agency";
type CaregiverSpecialty =
  | "general_care"
  | "fall_risk"
  | "mobility_support"
  | "vitals_monitoring"
  | "medication_support"
  | "rehab_support";

type FormState = {
  first_name: string;
  last_name: string;
  role: CaregiverRole;
  employee_code: string;
  department: CaregiverDepartment | "";
  employment_type: EmploymentType | "";
  specialty: CaregiverSpecialty | "";
  license_number: string;
  phone: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  photo_url: string;
  is_active: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

function emptyForm(): FormState {
  return {
    first_name: "",
    last_name: "",
    role: "caregiver",
    employee_code: "",
    department: "",
    employment_type: "",
    specialty: "",
    license_number: "",
    phone: "",
    email: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    photo_url: "",
    is_active: true,
  };
}

function hydrateForm(caregiver: Caregiver | null): FormState {
  if (!caregiver) return emptyForm();
  return {
    first_name: caregiver.first_name ?? "",
    last_name: caregiver.last_name ?? "",
    role: (caregiver.role?.toLowerCase() as CaregiverRole) || "caregiver",
    employee_code: caregiver.employee_code ?? "",
    department: (caregiver.department as CaregiverDepartment | "") ?? "",
    employment_type: (caregiver.employment_type as EmploymentType | "") ?? "",
    specialty: (caregiver.specialty as CaregiverSpecialty | "") ?? "",
    license_number: caregiver.license_number ?? "",
    phone: caregiver.phone ?? "",
    email: caregiver.email ?? "",
    emergency_contact_name: caregiver.emergency_contact_name ?? "",
    emergency_contact_phone: caregiver.emergency_contact_phone ?? "",
    photo_url: caregiver.photo_url ?? "",
    is_active: caregiver.is_active,
  };
}

function toStringValue(value: string): string {
  return value.trim();
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-outline-variant/20 bg-surface-container-low/40 p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-1 text-xs text-foreground-variant">{description}</p>
      </div>
      {children}
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-foreground-variant">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="input-field w-full text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-foreground-variant">
        {label}
      </label>
      <select
        id={id}
        className="input-field w-full text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function EditCaregiverModal({ open, caregiver, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => hydrateForm(caregiver));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOptions = useMemo<SelectOption[]>(
    () => [
      { value: "admin", label: t("shell.roleAdmin") },
      { value: "head_caregiver", label: t("shell.roleHeadCaregiver") },
      { value: "caregiver", label: t("shell.roleCaregiver") },
    ],
    [t],
  );
  const departmentOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("caregivers.option.notSet") },
      { value: "nursing", label: t("caregivers.department.nursing") },
      { value: "rehab", label: t("caregivers.department.rehab") },
      { value: "pharmacy", label: t("caregivers.department.pharmacy") },
      { value: "operations", label: t("caregivers.department.operations") },
      { value: "support", label: t("caregivers.department.support") },
    ],
    [t],
  );
  const employmentTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("caregivers.option.notSet") },
      { value: "full_time", label: t("caregivers.employment.fullTime") },
      { value: "part_time", label: t("caregivers.employment.partTime") },
      { value: "contract", label: t("caregivers.employment.contract") },
      { value: "agency", label: t("caregivers.employment.agency") },
    ],
    [t],
  );
  const specialtyOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("caregivers.option.notSet") },
      { value: "general_care", label: t("caregivers.specialty.generalCare") },
      { value: "fall_risk", label: t("caregivers.specialty.fallRisk") },
      { value: "mobility_support", label: t("caregivers.specialty.mobilitySupport") },
      { value: "vitals_monitoring", label: t("caregivers.specialty.vitalsMonitoring") },
      { value: "medication_support", label: t("caregivers.specialty.medicationSupport") },
      { value: "rehab_support", label: t("caregivers.specialty.rehabSupport") },
    ],
    [t],
  );

  useEffect(() => {
    if (!open || !caregiver) return;
    setForm(hydrateForm(caregiver));
    setError(null);
  }, [open, caregiver]);

  const canSubmit = form.first_name.trim().length >= 1 && form.last_name.trim().length >= 1;

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cg = caregiver;
    if (!cg || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<Caregiver>(`/caregivers/${cg.id}`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        employee_code: toStringValue(form.employee_code),
        department: form.department,
        employment_type: form.employment_type,
        specialty: form.specialty,
        license_number: toStringValue(form.license_number),
        phone: toStringValue(form.phone),
        email: toStringValue(form.email),
        emergency_contact_name: toStringValue(form.emergency_contact_name),
        emergency_contact_phone: toStringValue(form.emergency_contact_phone),
        photo_url: toStringValue(form.photo_url),
        is_active: form.is_active,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("caregivers.editStaffError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !caregiver) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-caregiver-heading"
    >
      <div className="surface-card w-full max-w-4xl space-y-5 overflow-y-auto rounded-xl p-6 animate-fade-in max-h-[min(90vh,820px)]">
        <div className="flex items-center justify-between gap-3">
          <h3
            id="edit-caregiver-heading"
            className="flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <Pencil className="h-5 w-5 text-primary" aria-hidden />
            {t("caregivers.editStaff")}
          </h3>
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-surface-container-high transition-smooth"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormSection
            title={t("caregivers.editIdentityTitle")}
            description={t("caregivers.editIdentityDescription")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-first"
                label={t("caregivers.firstNameRequired")}
                value={form.first_name}
                onChange={(value) => update({ first_name: value })}
              />
              <TextField
                id="edit-cg-last"
                label={t("caregivers.lastNameRequired")}
                value={form.last_name}
                onChange={(value) => update({ last_name: value })}
              />
              <TextField
                id="edit-cg-employee-code"
                label={t("caregivers.employeeCode")}
                value={form.employee_code}
                onChange={(value) => update({ employee_code: value })}
                placeholder="EMP-001"
              />
              <TextField
                id="edit-cg-photo-url"
                label={t("caregivers.photoUrl")}
                value={form.photo_url}
                onChange={(value) => update({ photo_url: value })}
                type="url"
                placeholder="https://..."
              />
            </div>
          </FormSection>

          <FormSection
            title={t("caregivers.editWorkTitle")}
            description={t("caregivers.editWorkDescription")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                id="edit-cg-role"
                label={t("profile.role")}
                value={form.role}
                onChange={(value) => update({ role: value as CaregiverRole })}
                options={roleOptions}
              />
              <SelectField
                id="edit-cg-department"
                label={t("caregivers.department")}
                value={form.department}
                onChange={(value) => update({ department: value as FormState["department"] })}
                options={departmentOptions}
              />
              <SelectField
                id="edit-cg-employment-type"
                label={t("caregivers.employmentType")}
                value={form.employment_type}
                onChange={(value) =>
                  update({ employment_type: value as FormState["employment_type"] })
                }
                options={employmentTypeOptions}
              />
              <SelectField
                id="edit-cg-specialty"
                label={t("caregivers.specialty")}
                value={form.specialty}
                onChange={(value) => update({ specialty: value as FormState["specialty"] })}
                options={specialtyOptions}
              />
              <TextField
                id="edit-cg-license"
                label={t("caregivers.licenseNumber")}
                value={form.license_number}
                onChange={(value) => update({ license_number: value })}
                placeholder="RN-12345"
              />
            </div>
          </FormSection>

          <FormSection
            title={t("caregivers.editContactTitle")}
            description={t("caregivers.editContactDescription")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-phone"
                label={t("caregivers.phone")}
                value={form.phone}
                onChange={(value) => update({ phone: value })}
                type="tel"
                placeholder="+66-xxx-xxx-xxxx"
              />
              <TextField
                id="edit-cg-email"
                label={t("caregivers.email")}
                value={form.email}
                onChange={(value) => update({ email: value })}
                type="email"
                placeholder="name@example.com"
              />
            </div>
          </FormSection>

          <FormSection
            title={t("caregivers.editEmergencyTitle")}
            description={t("caregivers.editEmergencyDescription")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-emergency-name"
                label={t("caregivers.emergencyContactName")}
                value={form.emergency_contact_name}
                onChange={(value) => update({ emergency_contact_name: value })}
                placeholder={t("caregivers.familyContactPlaceholder")}
              />
              <TextField
                id="edit-cg-emergency-phone"
                label={t("caregivers.emergencyContactPhone")}
                value={form.emergency_contact_phone}
                onChange={(value) => update({ emergency_contact_phone: value })}
                type="tel"
                placeholder="+66-xxx-xxx-xxxx"
              />
            </div>
          </FormSection>

          <FormSection
            title={t("caregivers.editStatusTitle")}
            description={t("caregivers.editStatusDescription")}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-cg-active"
                checked={form.is_active}
                onChange={(event) => update({ is_active: event.target.checked })}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <label htmlFor="edit-cg-active" className="text-sm font-medium text-foreground">
                {t("common.active")}
              </label>
            </div>
          </FormSection>

          {error ? (
            <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">{error}</p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-foreground-variant hover:bg-surface-container-low transition-smooth"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="gradient-cta inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50 transition-smooth"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitting ? t("common.saving") : t("caregivers.editStaffSave")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
