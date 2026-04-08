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

type CaregiverRole = "admin" | "observer" | "supervisor" | "head_nurse";
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

const DEPARTMENT_OPTIONS: SelectOption[] = [
  { value: "", label: "Not set" },
  { value: "nursing", label: "Nursing" },
  { value: "rehab", label: "Rehab" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "operations", label: "Operations" },
  { value: "support", label: "Support" },
];

const EMPLOYMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "Not set" },
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "agency", label: "Agency" },
];

const SPECIALTY_OPTIONS: SelectOption[] = [
  { value: "", label: "Not set" },
  { value: "general_care", label: "General care" },
  { value: "fall_risk", label: "Fall risk" },
  { value: "mobility_support", label: "Mobility support" },
  { value: "vitals_monitoring", label: "Vitals monitoring" },
  { value: "medication_support", label: "Medication support" },
  { value: "rehab_support", label: "Rehab support" },
];

function emptyForm(): FormState {
  return {
    first_name: "",
    last_name: "",
    role: "observer",
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
    role: (caregiver.role?.toLowerCase() as CaregiverRole) || "observer",
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
        <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
        <p className="mt-1 text-xs text-on-surface-variant">{description}</p>
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
      <label htmlFor={id} className="block text-xs font-medium text-on-surface-variant">
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
      <label htmlFor={id} className="block text-xs font-medium text-on-surface-variant">
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
      { value: "head_nurse", label: t("shell.roleHeadNurse") },
      { value: "supervisor", label: t("shell.roleSupervisor") },
      { value: "observer", label: t("shell.roleObserver") },
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
            className="flex items-center gap-2 text-lg font-bold text-on-surface"
          >
            <Pencil className="h-5 w-5 text-primary" aria-hidden />
            {t("caregivers.editStaff")}
          </h3>
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-surface-container-high transition-smooth"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormSection
            title="Identity"
            description="Basic identity and profile details used throughout the staff directory."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-first"
                label="First name *"
                value={form.first_name}
                onChange={(value) => update({ first_name: value })}
              />
              <TextField
                id="edit-cg-last"
                label="Last name *"
                value={form.last_name}
                onChange={(value) => update({ last_name: value })}
              />
              <TextField
                id="edit-cg-employee-code"
                label="Employee code"
                value={form.employee_code}
                onChange={(value) => update({ employee_code: value })}
                placeholder="EMP-001"
              />
              <TextField
                id="edit-cg-photo-url"
                label="Photo URL"
                value={form.photo_url}
                onChange={(value) => update({ photo_url: value })}
                type="url"
                placeholder="https://..."
              />
            </div>
          </FormSection>

          <FormSection
            title="Work Profile"
            description="Role and professional profile used for routing, privileges, and staffing context."
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
                label="Department"
                value={form.department}
                onChange={(value) => update({ department: value as FormState["department"] })}
                options={DEPARTMENT_OPTIONS}
              />
              <SelectField
                id="edit-cg-employment-type"
                label="Employment type"
                value={form.employment_type}
                onChange={(value) =>
                  update({ employment_type: value as FormState["employment_type"] })
                }
                options={EMPLOYMENT_TYPE_OPTIONS}
              />
              <SelectField
                id="edit-cg-specialty"
                label="Specialty"
                value={form.specialty}
                onChange={(value) => update({ specialty: value as FormState["specialty"] })}
                options={SPECIALTY_OPTIONS}
              />
              <TextField
                id="edit-cg-license"
                label="License number"
                value={form.license_number}
                onChange={(value) => update({ license_number: value })}
                placeholder="RN-12345"
              />
            </div>
          </FormSection>

          <FormSection
            title="Contact"
            description="Primary contact details for staff communication."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-phone"
                label="Phone"
                value={form.phone}
                onChange={(value) => update({ phone: value })}
                type="tel"
                placeholder="+66-xxx-xxx-xxxx"
              />
              <TextField
                id="edit-cg-email"
                label="Email"
                value={form.email}
                onChange={(value) => update({ email: value })}
                type="email"
                placeholder="name@example.com"
              />
            </div>
          </FormSection>

          <FormSection
            title="Emergency"
            description="Fallback contact used when the staff member cannot be reached."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="edit-cg-emergency-name"
                label="Emergency contact name"
                value={form.emergency_contact_name}
                onChange={(value) => update({ emergency_contact_name: value })}
                placeholder="Family contact"
              />
              <TextField
                id="edit-cg-emergency-phone"
                label="Emergency contact phone"
                value={form.emergency_contact_phone}
                onChange={(value) => update({ emergency_contact_phone: value })}
                type="tel"
                placeholder="+66-xxx-xxx-xxxx"
              />
            </div>
          </FormSection>

          <FormSection
            title="Status"
            description="Activate or deactivate the staff account without removing the profile."
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-cg-active"
                checked={form.is_active}
                onChange={(event) => update({ is_active: event.target.checked })}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <label htmlFor="edit-cg-active" className="text-sm font-medium text-on-surface">
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
              className="rounded-xl px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-smooth"
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
