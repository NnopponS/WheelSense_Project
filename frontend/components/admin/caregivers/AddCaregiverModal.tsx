"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import type { Caregiver } from "@/lib/types";
import { X, UserPlus, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type CaregiverRole = "admin" | "observer" | "supervisor" | "head_nurse";

export default function AddCaregiverModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<CaregiverRole>("observer");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  // User creation state
  const [createAccount, setCreateAccount] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canSubmit = 
    firstName.trim().length >= 1 && 
    lastName.trim().length >= 1 &&
    (!createAccount || (username.trim().length >= 3 && password.length >= 6));

  function resetForm() {
    setFirstName("");
    setLastName("");
    setRole("observer");
    setPhone("");
    setEmail("");
    setCreateAccount(false);
    setUsername("");
    setPassword("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const cgResponse = await api.post<Caregiver>("/caregivers", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        phone: phone.trim(),
        email: email.trim(),
      });
      
      if (createAccount) {
        await api.post("/users", {
          username: username.trim(),
          password,
          role,
          caregiver_id: cgResponse.id,
          is_active: true
        });
      }

      resetForm();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create staff member");
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
      aria-labelledby="add-caregiver-heading"
    >
      <div className="surface-card w-full max-w-lg space-y-5 p-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <h3
            id="add-caregiver-heading"
            className="flex items-center gap-2 text-lg font-bold text-on-surface"
          >
            <UserPlus className="h-5 w-5 text-primary" aria-hidden />
            {t("caregivers.addNew")}
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
              <label
                htmlFor="cg-first-name"
                className="block text-xs font-medium text-on-surface-variant"
              >
                First Name *
              </label>
              <input
                id="cg-first-name"
                type="text"
                className="input-field mt-1 w-full text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label
                htmlFor="cg-last-name"
                className="block text-xs font-medium text-on-surface-variant"
              >
                Last Name *
              </label>
              <input
                id="cg-last-name"
                type="text"
                className="input-field mt-1 w-full text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="cg-role"
              className="block text-xs font-medium text-on-surface-variant"
            >
              Role
            </label>
            <select
              id="cg-role"
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
              <label
                htmlFor="cg-phone"
                className="block text-xs font-medium text-on-surface-variant"
              >
                Phone
              </label>
              <input
                id="cg-phone"
                type="tel"
                className="input-field mt-1 w-full text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+66-xxx-xxx-xxxx"
              />
            </div>
            <div>
              <label
                htmlFor="cg-email"
                className="block text-xs font-medium text-on-surface-variant"
              >
                Email
              </label>
              <input
                id="cg-email"
                type="email"
                className="input-field mt-1 w-full text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div className="border-t border-outline-variant/20 pt-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cg-create-account"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <label htmlFor="cg-create-account" className="text-sm font-medium text-on-surface">
                Create login account for this staff member
              </label>
            </div>
            
            {createAccount && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 animate-fade-in">
                <div>
                  <label
                    htmlFor="cg-username"
                    className="block text-xs font-medium text-on-surface-variant"
                  >
                    Username * <span className="text-outline text-[10px] ml-1">(min 3 chars)</span>
                  </label>
                  <input
                    id="cg-username"
                    type="text"
                    className="input-field mt-1 w-full text-sm"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={createAccount}
                  />
                </div>
                <div>
                  <label
                    htmlFor="cg-password"
                    className="block text-xs font-medium text-on-surface-variant"
                  >
                    Password * <span className="text-outline text-[10px] ml-1">(min 6 chars)</span>
                  </label>
                  <input
                    id="cg-password"
                    type="password"
                    className="input-field mt-1 w-full text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={createAccount}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-smooth"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="gradient-cta inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50 transition-smooth"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {submitting ? "Creating…" : t("caregivers.addNew")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
