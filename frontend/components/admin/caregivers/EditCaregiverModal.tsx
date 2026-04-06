"use client";

import { useEffect, useState } from "react";
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

export default function EditCaregiverModal({ open, caregiver, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<CaregiverRole>("observer");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !caregiver) return;
    setFirstName(caregiver.first_name);
    setLastName(caregiver.last_name);
    setRole((caregiver.role?.toLowerCase() as CaregiverRole) || "observer");
    setPhone(caregiver.phone ?? "");
    setEmail(caregiver.email ?? "");
    setIsActive(caregiver.is_active);
    setError(null);
  }, [open, caregiver]);

  if (!open || !caregiver) return null;

  const canSubmit = firstName.trim().length >= 1 && lastName.trim().length >= 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cg = caregiver;
    if (!cg || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<Caregiver>(`/caregivers/${cg.id}`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        phone: phone.trim(),
        email: email.trim(),
        is_active: isActive,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("caregivers.editStaffError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-caregiver-heading"
    >
      <div className="surface-card w-full max-w-lg space-y-5 p-6 animate-fade-in">
        <div className="flex items-center justify-between">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-cg-first" className="block text-xs font-medium text-on-surface-variant">
                First name *
              </label>
              <input
                id="edit-cg-first"
                type="text"
                className="input-field mt-1 w-full text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-cg-last" className="block text-xs font-medium text-on-surface-variant">
                Last name *
              </label>
              <input
                id="edit-cg-last"
                type="text"
                className="input-field mt-1 w-full text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-cg-role" className="block text-xs font-medium text-on-surface-variant">
              Role
            </label>
            <select
              id="edit-cg-role"
              className="input-field mt-1 w-full text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as CaregiverRole)}
            >
              <option value="admin">Admin</option>
              <option value="head_nurse">Head Nurse</option>
              <option value="supervisor">Supervisor</option>
              <option value="observer">Observer</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-cg-phone" className="block text-xs font-medium text-on-surface-variant">
                Phone
              </label>
              <input
                id="edit-cg-phone"
                type="tel"
                className="input-field mt-1 w-full text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-cg-email" className="block text-xs font-medium text-on-surface-variant">
                Email
              </label>
              <input
                id="edit-cg-email"
                type="email"
                className="input-field mt-1 w-full text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-cg-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <label htmlFor="edit-cg-active" className="text-sm font-medium text-on-surface">
              {t("common.active")}
            </label>
          </div>

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
