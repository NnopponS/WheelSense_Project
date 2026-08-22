"use client";

import Link from "next/link";
import { Phone, Siren } from "lucide-react";
import type { Caregiver, PatientContact } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { formatStaffRoleLabel } from "@/lib/staffRoleLabel";
import { getCaregiverDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import UserAvatar from "@/components/shared/UserAvatar";

/* ── EmergencyAlertRail ──────────────────────────────────────────────────── */

export type EmergencyDraft = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
};

export function EmergencyAlertRail({
  contact,
  severeAnomalyActive,
  anomalySummary,
  isEditing,
  isSaving,
  canEdit,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  error,
  className,
}: {
  contact: PatientContact | null;
  severeAnomalyActive: boolean;
  anomalySummary: string | null;
  isEditing: boolean;
  isSaving: boolean;
  canEdit: boolean;
  draft: EmergencyDraft;
  onDraftChange: (patch: Partial<EmergencyDraft>) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  error?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <section
      id="emergency-alert"
      className={cn(
        "scroll-mt-32 overflow-hidden rounded-2xl border shadow-sm",
        severeAnomalyActive ? "border-red-300" : "border-outline-variant/20",
        className,
      )}
    >
      {/* Header band */}
      <div className={cn("flex items-center justify-between gap-2 px-4 py-3", severeAnomalyActive ? "bg-red-50" : "bg-surface-container")}>
        <div className="flex items-center gap-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", severeAnomalyActive ? "bg-red-100" : "bg-primary/10")}>
            <Siren className={cn("h-4 w-4", severeAnomalyActive ? "text-red-600" : "text-primary")} aria-hidden />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{t("patients.formSectionEmergency")}</h2>
        </div>
        {canEdit && (
          isEditing ? (
            <div className="flex gap-1.5">
              <button type="button" className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={onCancelEdit} disabled={isSaving}>{t("common.cancel")}</button>
              <button type="button" className="min-h-11 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={onSave} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</button>
            </div>
          ) : (
            <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={onStartEdit}>{t("common.edit")}</button>
          )
        )}
      </div>

      {/* Anomaly linkage banner */}
      {severeAnomalyActive && anomalySummary && (
        <div className="border-b border-red-200 bg-red-50/60 px-4 py-2.5">
          <p className="text-xs font-semibold text-red-700">{t("patient.feature.criticalCondition")}</p>
          <p className="mt-0.5 text-xs text-red-600/80">{anomalySummary}</p>
        </div>
      )}

      {/* Body */}
      <div className="bg-card p-4">
        {isEditing ? (
          <div className="space-y-2">
            <input className="input-field w-full text-sm" placeholder={t("patients.ecName")} value={draft.name} onChange={(e) => onDraftChange({ name: e.target.value })} />
            <input className="input-field w-full text-sm" placeholder={t("patients.ecRelationship")} value={draft.relationship} onChange={(e) => onDraftChange({ relationship: e.target.value })} />
            <input className="input-field w-full text-sm" placeholder={t("patients.ecPhone")} value={draft.phone} onChange={(e) => onDraftChange({ phone: e.target.value })} />
            <input className="input-field w-full text-sm" placeholder={t("patients.ecEmail")} value={draft.email} onChange={(e) => onDraftChange({ email: e.target.value })} />
            <textarea className="input-field min-h-[60px] w-full text-sm" placeholder={t("patients.ecContactNotes")} value={draft.notes} onChange={(e) => onDraftChange({ notes: e.target.value })} />
          </div>
        ) : contact ? (
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-base leading-tight text-foreground">{contact.name}</p>
              {contact.relationship && <p className="text-xs text-foreground-variant mt-0.5">{contact.relationship}</p>}
            </div>
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15 transition-smooth">
                <Phone className="h-4 w-4" />{contact.phone}
              </a>
            )}
            {contact.notes && <p className="text-xs text-foreground-variant leading-relaxed">{contact.notes}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground-variant">{t("patients.noEmergencyContact")}</p>
            {canEdit && (
              <button type="button" className="min-h-11 w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10" onClick={onStartEdit}>
                {t("patient.feature.addContact")}
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-error">{error}</p>}
      </div>
    </section>
  );
}

/* ── AssignedStaffCard ───────────────────────────────────────────────────── */

export function AssignedStaffCard({
  staffCount,
  canManage,
  staffSearch,
  onStaffSearchChange,
  staffPickerOptions,
  staffSearchInputId,
  staffSearchListboxId,
  onSelectStaff,
  draftStaff,
  authRole,
  onRemoveStaff,
  onSaveStaff,
  staffSaving,
  staffError,
  readOnlyHint,
  className,
}: {
  staffCount: number;
  canManage: boolean;
  staffSearch: string;
  onStaffSearchChange: (v: string) => void;
  staffPickerOptions: SearchableListboxOption[];
  staffSearchInputId: string;
  staffSearchListboxId: string;
  onSelectStaff: (optId: string) => void;
  draftStaff: Caregiver[];
  authRole: string;
  onRemoveStaff: (id: number) => void;
  onSaveStaff: () => void;
  staffSaving: boolean;
  staffError: string | null;
  readOnlyHint: string;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <section className={cn("scroll-mt-32 rounded-2xl border border-outline-variant/20 bg-card p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("patients.sectionResponsibleStaff")}</h2>
        {staffCount > 0 && (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">{staffCount}</span>
        )}
      </div>

      {canManage && (
        <div className="mb-3">
          <SearchableListboxPicker
            inputId={staffSearchInputId}
            listboxId={staffSearchListboxId}
            options={staffPickerOptions}
            search={staffSearch}
            onSearchChange={onStaffSearchChange}
            searchPlaceholder={t("patients.searchStaffPlaceholder")}
            selectedOptionId={null}
            onSelectOption={onSelectStaff}
            disabled={staffSaving}
            listboxAriaLabel={t("patients.responsibleStaffListbox")}
            noMatchMessage={t("patients.responsibleStaffNoMatch")}
            emptyStateMessage={staffPickerOptions.length === 0 ? t("caregivers.empty") : null}
            emptyNoMatch={staffSearch.trim().length > 0}
          />
        </div>
      )}
      {!canManage && <p className="mb-3 text-xs text-foreground-variant">{readOnlyHint}</p>}
      {staffError && <p className="mb-3 text-sm text-critical">{staffError}</p>}

      {draftStaff.length === 0 ? (
        <p className="text-sm text-foreground-variant">{t("patients.responsibleStaffEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {draftStaff.map((person) => (
            <li key={person.id} className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm hover:border-primary/30 transition-smooth">
              <div className="flex items-center gap-3">
                <UserAvatar
                  username={`${person.first_name} ${person.last_name}`.trim() || `Staff #${person.id}`}
                  profileImageUrl={person.photo_url}
                  sizePx={32}
                  fallbackClassName="bg-primary/10 text-primary"
                />
                <Link href={getCaregiverDetailPath(authRole || "admin", person.id)} className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{person.first_name} {person.last_name}</span>
                  <span className="text-xs text-foreground-variant">{formatStaffRoleLabel(person.role, t)}{person.employee_code?.trim() ? ` · ${person.employee_code.trim()}` : ""}</span>
                </Link>
                {canManage && (
                  <button type="button" className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-critical hover:bg-critical/10" onClick={() => onRemoveStaff(person.id)}>{t("patients.responsibleStaffRemove")}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <button type="button" className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={onSaveStaff} disabled={staffSaving}>
          {staffSaving ? t("patients.responsibleStaffSaving") : t("patients.responsibleStaffSave")}
        </button>
      )}
    </section>
  );
}
