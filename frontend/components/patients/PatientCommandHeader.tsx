"use client";

import type { ChangeEvent, ReactNode } from "react";
import Image from "next/image";
import { CalendarDays, Droplets, MapPin, Ruler, User, Weight } from "lucide-react";
import type { Patient, Room } from "@/lib/types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { ageYears } from "@/lib/age";
import { bodyMassIndex, bmiCategory } from "@/lib/patientMetrics";
import { cn } from "@/lib/utils";

export type PatientHeaderDraft = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  care_level: string;
  mobility_type: string;
  blood_type: string;
  height_cm: string;
  weight_kg: string;
  room_id: string;
  is_active: boolean;
};

export function PatientCommandHeader({
  patient,
  roomDetail,
  nowMs,
  canEdit,
  isEditing,
  isSaving,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  photoInputId,
  photoBusy,
  photoError,
  onPickPhoto,
  onRemovePhoto,
  onOpenMap,
  errorAbout,
  className,
}: {
  patient: Patient;
  roomDetail: Room | null;
  nowMs: number;
  canEdit: boolean;
  isEditing: boolean;
  isSaving: boolean;
  draft: PatientHeaderDraft;
  onDraftChange: (patch: Partial<PatientHeaderDraft>) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  photoInputId: string;
  photoBusy: boolean;
  photoError: string | null;
  onPickPhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  onOpenMap: () => void;
  errorAbout?: string;
  className?: string;
}) {
  const { t, locale } = useTranslation();
  const age = ageYears(patient.date_of_birth, nowMs);
  const bmi = bodyMassIndex(patient.height_cm, patient.weight_kg);
  const bmiCat = bmiCategory(bmi);
  const bmiLabel =
    bmiCat === "normal" ? t("patients.bmiNormal")
      : bmiCat === "underweight" ? t("patients.bmiUnderweight")
        : bmiCat === "overweight" ? t("patients.bmiOverweight")
          : bmiCat === "obese" ? t("patients.bmiObese")
            : "—";
  const patientPhotoUrl = patient.photo_url?.trim();
  const localeTag = locale === "th" ? "th-TH" : "en-US";

  const genderLabel =
    patient.gender === "male" ? t("patients.genderMale")
      : patient.gender === "female" ? t("patients.genderFemale")
        : patient.gender === "other" ? t("patients.genderOther")
          : patient.gender || "—";

  return (
    <section
      className={cn(
        "sticky top-0 z-20 rounded-2xl border border-outline-variant/20 bg-surface/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface/80",
        className,
      )}
    >
      {/* edit toolbar */}
      {canEdit && (
        <div className="absolute right-4 top-4 z-10">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 bg-surface px-4 py-2 text-sm font-medium text-foreground-variant hover:bg-surface-container-high" onClick={onCancelEdit} disabled={isSaving}>{t("common.cancel")}</button>
              <button type="button" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90" onClick={onSave} disabled={isSaving || !draft.first_name.trim() || !draft.last_name.trim()}>{isSaving ? t("common.saving") : t("common.save")}</button>
            </div>
          ) : (
            <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-container-high" onClick={onStartEdit}>{t("common.edit")}</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
        {/* Avatar column */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-outline-variant/25 bg-gradient-to-br from-primary/20 to-primary/5 sm:h-24 sm:w-24">
            {canEdit && (
              <label htmlFor={photoInputId} className={cn("absolute inset-0 z-[5] cursor-pointer", photoBusy && "pointer-events-none")} aria-hidden="true" />
            )}
            {patientPhotoUrl ? (
              <Image src={patientPhotoUrl} alt={`${patient.first_name} ${patient.last_name}`} fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary/50">
                {patient.first_name?.[0]}{patient.last_name?.[0]}
              </div>
            )}
            {canEdit && patientPhotoUrl && (
              <button type="button" className="absolute right-1 top-1 z-10 min-h-11 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white hover:bg-black/75 disabled:opacity-50" disabled={photoBusy} onClick={onRemovePhoto}>{t("profile.avatar.removePhoto")}</button>
            )}
          </div>
          {canEdit && (
            <label htmlFor={photoInputId} className="flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-center text-xs font-medium text-primary hover:bg-primary/10">{t("profile.avatar.localFileLabel")}</label>
          )}
          <input id={photoInputId} type="file" accept="image/*" disabled={photoBusy} onChange={onPickPhoto} className="sr-only" />
          {photoError && <p className="text-center text-xs text-destructive">{photoError}</p>}
          <span className="rounded-md bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-foreground-variant">#{patient.id}</span>
        </div>

        {/* Info column */}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label={t("patients.firstName")}><input className="input-field w-full text-sm" value={draft.first_name} onChange={(e) => onDraftChange({ first_name: e.target.value })} /></Field>
              <Field label={t("patients.lastName")}><input className="input-field w-full text-sm" value={draft.last_name} onChange={(e) => onDraftChange({ last_name: e.target.value })} /></Field>
              <Field label={t("patients.dateOfBirth")}><input type="date" className="input-field w-full text-sm" value={draft.date_of_birth} onChange={(e) => onDraftChange({ date_of_birth: e.target.value })} /></Field>
              <Field label={t("patients.gender")}>
                <select className="input-field w-full text-sm" value={draft.gender} onChange={(e) => onDraftChange({ gender: e.target.value })}>
                  <option value="">{t("patients.genderUnset")}</option>
                  <option value="male">{t("patients.genderMale")}</option>
                  <option value="female">{t("patients.genderFemale")}</option>
                  <option value="other">{t("patients.genderOther")}</option>
                </select>
              </Field>
              <Field label={t("patients.careLevel")}>
                <select className="input-field w-full text-sm" value={draft.care_level} onChange={(e) => onDraftChange({ care_level: e.target.value })}>
                  <option value="normal">{t("patients.careLevelNormal")}</option>
                  <option value="special">{t("patients.careLevelSpecial")}</option>
                  <option value="critical">{t("patients.careLevelCritical")}</option>
                </select>
              </Field>
              <Field label={t("patients.mobilityType")}>
                <select className="input-field w-full text-sm" value={draft.mobility_type} onChange={(e) => onDraftChange({ mobility_type: e.target.value })}>
                  <option value="wheelchair">{t("patients.mobilityWheelchair")}</option>
                  <option value="walker">{t("patients.mobilityWalker")}</option>
                  <option value="independent">{t("patients.mobilityIndependent")}</option>
                </select>
              </Field>
              <Field label={t("patients.bloodType")}><input className="input-field w-full text-sm" value={draft.blood_type} onChange={(e) => onDraftChange({ blood_type: e.target.value })} /></Field>
              <Field label={t("patients.heightCm")}><input className="input-field w-full text-sm" value={draft.height_cm} onChange={(e) => onDraftChange({ height_cm: e.target.value })} /></Field>
              <Field label={t("patients.weightKg")}><input className="input-field w-full text-sm" value={draft.weight_kg} onChange={(e) => onDraftChange({ weight_kg: e.target.value })} /></Field>
              <Field label={t("patients.room")}><input className="input-field w-full text-sm" value={draft.room_id} onChange={(e) => onDraftChange({ room_id: e.target.value })} placeholder={t("patients.noRoom")} /></Field>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2"><input type="checkbox" checked={draft.is_active} onChange={(e) => onDraftChange({ is_active: e.target.checked })} />{t("patients.statusActive")}</label>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{patient.first_name} {patient.last_name}</h1>
                <p className="text-sm text-foreground-variant">
                  {age != null ? `${age} ${t("patients.years")}` : "—"} · {genderLabel}
                </p>
              </div>

              {/* Status chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold care-${patient.care_level}")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", patient.care_level === "critical" ? "bg-critical" : patient.care_level === "special" ? "bg-warning" : "bg-success")} />
                  {patient.care_level}
                </span>
                <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-foreground-variant">{patient.mobility_type}</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", patient.is_active ? "bg-success-bg text-success" : "bg-surface-container text-outline")}>{patient.is_active ? t("patients.statusActive") : t("patients.statusInactive")}</span>
                {patient.blood_type && <span className="rounded-full border border-outline-variant/30 px-2.5 py-0.5 text-xs font-mono font-medium text-foreground">{patient.blood_type}</span>}
              </div>

              {/* Room row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-variant">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {patient.room_id == null ? (
                    <span>{t("patients.noRoom")}</span>
                  ) : roomDetail ? (
                    <span className="font-medium text-foreground">{roomDetail.name?.trim() || `Room #${roomDetail.id}`}{roomDetail.floor_name ? ` · ${roomDetail.floor_name}` : ""}</span>
                  ) : (
                    <span>#{patient.room_id}</span>
                  )}
                </span>
                {patient.room_id != null && (
                  <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/10" onClick={onOpenMap}>{t("patients.roomOpenFacility")}</button>
                )}
              </div>
            </>
          )}
          {errorAbout && <p className="mt-2 text-sm text-error">{errorAbout}</p>}
        </div>
      </div>

      {/* Inline vital stats bar */}
      {!isEditing && (
        <div className="grid grid-cols-2 gap-px border-t border-outline-variant/15 bg-outline-variant/10 sm:grid-cols-5">
          {[
            { icon: CalendarDays, label: t("patients.detailDob"), value: patient.date_of_birth ? new Date(patient.date_of_birth + "T12:00:00").toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric" }) : "—" },
            { icon: Ruler, label: t("patients.heightCm"), value: patient.height_cm != null ? `${patient.height_cm} cm` : "—" },
            { icon: Weight, label: t("patients.weightKg"), value: patient.weight_kg != null ? `${patient.weight_kg} kg` : "—" },
            { icon: User, label: t("patients.detailBmi"), value: bmi != null ? `${bmi}` : "—", sub: bmi != null ? bmiLabel : undefined },
            { icon: Droplets, label: t("patients.bloodType"), value: patient.blood_type || "—" },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="flex flex-col items-center gap-0.5 bg-surface/80 px-3 py-2.5 text-center">
              <Icon className="mb-0.5 h-3.5 w-3.5 text-primary/70" />
              <span className="text-[10px] font-medium tracking-wide text-foreground-variant">{label}</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
              {sub && <span className="text-[10px] text-foreground-variant">{sub}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-sm text-foreground-variant">{label}</span>
      {children}
    </label>
  );
}

/* i18n keys referenced (kept here to satisfy TranslationKey typing expectations):
 * patients.mobilityWalker, patients.mobilityIndependent, profile.avatar.removePhoto,
 * profile.avatar.localFileLabel, common.cancel, common.save, common.saving, common.edit
 */
export type _HeaderTranslationKeys =
  | "patients.mobilityWalker"
  | "patients.mobilityIndependent"
  | "profile.avatar.removePhoto"
  | "profile.avatar.localFileLabel"
  | "common.cancel"
  | "common.save"
  | "common.saving"
  | "common.edit";
