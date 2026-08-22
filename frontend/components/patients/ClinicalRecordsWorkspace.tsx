"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MedicalConditionEntry, Patient, PatientMedication, PatientPastSurgery } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ClinicalDrafts = {
  medical_conditions_raw: string;
  allergies_raw: string;
  medications_raw: string;
  notes: string;
};

export type ClinicalCard = "chronic" | "allergies" | "medications" | "notes";

function formatCondition(c: MedicalConditionEntry): string {
  if (typeof c === "string") return c;
  const o = c as Record<string, unknown>;
  if (typeof o.label === "string") return o.label;
  if (typeof o.name === "string") return o.name;
  if (typeof o.condition === "string") return o.condition;
  return String(o.type ?? "—");
}

export function ClinicalRecordsWorkspace({
  patient,
  editingCard,
  savingCard,
  drafts,
  canEdit,
  cardErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDraftChange,
  className,
}: {
  patient: Patient;
  editingCard: ClinicalCard | null;
  savingCard: ClinicalCard | null;
  drafts: ClinicalDrafts;
  canEdit: boolean;
  cardErrors: Partial<Record<ClinicalCard, string>>;
  onStartEdit: (card: ClinicalCard) => void;
  onCancelEdit: () => void;
  onSave: (card: ClinicalCard) => void;
  onDraftChange: (patch: Partial<ClinicalDrafts>) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const surgeries = patient.past_surgeries ?? [];
  const medCount = patient.medications?.filter((m) => (m.name || "").trim()).length ?? 0;

  return (
    <section id="clinical-records" className={cn("scroll-mt-32 rounded-2xl border border-border/60 bg-card shadow-sm", className)}>
      <div className="border-b border-border/50 px-5 py-3">
        <h2 className="font-semibold text-foreground">{t("patients.detailTabProfile")}</h2>
      </div>
      <Tabs defaultValue="conditions" className="w-full">
        <TabsList className="mx-4 my-3 grid h-auto w-auto grid-cols-4 gap-1 rounded-lg border border-border/40 bg-muted/20 p-1 sm:grid-cols-5">
          <TabsTrigger value="conditions" className="text-xs">{t("patients.sectionChronic")}</TabsTrigger>
          <TabsTrigger value="allergies" className="text-xs">{t("patients.sectionAllergies")}</TabsTrigger>
          <TabsTrigger value="medications" className="text-xs">{t("patients.sectionMeds")}</TabsTrigger>
          <TabsTrigger value="surgeries" className="text-xs">{t("patients.sectionSurgeries")}</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs col-span-4 sm:col-span-1">{t("patients.formSectionNotes")}</TabsTrigger>
        </TabsList>

        {/* Chronic conditions */}
        <TabsContent value="conditions" className="mt-0 px-5 pb-5">
          <RecordHeader
            title={t("patients.sectionChronic")}
            card="chronic"
            editingCard={editingCard}
            savingCard={savingCard}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSave={onSave}
            t={t}
          />
          {editingCard === "chronic" ? (
            <textarea className="input-field min-h-[110px] w-full text-sm" value={drafts.medical_conditions_raw} onChange={(e) => onDraftChange({ medical_conditions_raw: e.target.value })} placeholder={t("patients.chronicPlaceholder")} />
          ) : patient.medical_conditions.length === 0 ? (
            <p className="text-sm text-foreground-variant">—</p>
          ) : (
            <ul className="space-y-2">
              {patient.medical_conditions.map((c, i) => {
                const raw = c as Record<string, unknown>;
                const sev = String(raw.severity ?? "").toLowerCase();
                const sevClass = sev === "high" || sev === "สูง" ? "border-critical/30 bg-critical-bg text-foreground"
                  : sev === "medium" || sev === "ปานกลาง" ? "border-warning/30 bg-warning-bg text-foreground"
                  : "border-outline-variant/30 bg-surface-container-high text-foreground";
                return (
                  <li key={i} className={cn("flex items-start justify-between gap-2 rounded-lg border px-4 py-3 text-sm", sevClass)}>
                    <span className="font-medium">{formatCondition(c)}</span>
                    {sev && <span className="shrink-0 rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">{sev}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {cardErrors.chronic && <p className="mt-3 text-sm text-error">{cardErrors.chronic}</p>}
        </TabsContent>

        {/* Allergies */}
        <TabsContent value="allergies" className="mt-0 px-5 pb-5">
          <RecordHeader
            title={t("patients.sectionAllergies")}
            card="allergies"
            editingCard={editingCard}
            savingCard={savingCard}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSave={onSave}
            t={t}
          />
          {editingCard === "allergies" ? (
            <textarea className="input-field min-h-[110px] w-full text-sm" value={drafts.allergies_raw} onChange={(e) => onDraftChange({ allergies_raw: e.target.value })} placeholder={t("patients.allergiesPlaceholder")} />
          ) : patient.allergies.length === 0 ? (
            <p className="text-sm text-foreground-variant">—</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {patient.allergies.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-critical/30 bg-critical-bg px-3 py-1 text-xs font-semibold text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-critical" />
                  {a}
                </span>
              ))}
            </div>
          )}
          {cardErrors.allergies && <p className="mt-3 text-sm text-error">{cardErrors.allergies}</p>}
        </TabsContent>

        {/* Medications */}
        <TabsContent value="medications" className="mt-0 px-5 pb-5">
          <RecordHeader
            title={t("patients.sectionMeds")}
            badge={medCount > 0 ? `${medCount} ${t("patients.activeMedsBadge")}` : undefined}
            card="medications"
            editingCard={editingCard}
            savingCard={savingCard}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSave={onSave}
            t={t}
          />
          {editingCard === "medications" ? (
            <textarea className="input-field min-h-[110px] w-full text-sm" value={drafts.medications_raw} onChange={(e) => onDraftChange({ medications_raw: e.target.value })} placeholder={t("patients.medName")} />
          ) : medCount === 0 ? (
            <p className="text-sm text-foreground-variant">—</p>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {patient.medications.filter((m) => (m.name || "").trim()).map((m: PatientMedication, i) => (
                <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground text-sm">{m.name}</p>
                    {(m.dosage || m.frequency) && <p className="mt-0.5 text-xs text-foreground-variant">{[m.dosage, m.frequency].filter(Boolean).join(" · ")}</p>}
                    {m.instructions && <p className="mt-1 text-[10px] uppercase tracking-wide text-foreground-variant">{m.instructions}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cardErrors.medications && <p className="mt-3 text-sm text-error">{cardErrors.medications}</p>}
        </TabsContent>

        {/* Past surgeries */}
        <TabsContent value="surgeries" className="mt-0 px-5 pb-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t("patients.sectionSurgeries")}</h3>
          {surgeries.length === 0 ? (
            <p className="text-sm text-foreground-variant">—</p>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {surgeries.map((s: PatientPastSurgery, i) => (
                <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-sm">{s.procedure || "—"}</p>
                    <p className="mt-0.5 text-xs text-foreground-variant">{[s.facility, s.year != null && s.year !== "" ? String(s.year) : null].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Clinical notes */}
        <TabsContent value="notes" className="mt-0 px-5 pb-5">
          <RecordHeader
            title={t("patients.formSectionNotes")}
            card="notes"
            editingCard={editingCard}
            savingCard={savingCard}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSave={onSave}
            t={t}
          />
          {editingCard === "notes" ? (
            <textarea className="input-field min-h-[110px] w-full text-sm" value={drafts.notes} onChange={(e) => onDraftChange({ notes: e.target.value })} />
          ) : patient.notes?.trim() ? (
            <p className="text-sm text-foreground-variant whitespace-pre-wrap leading-relaxed">{patient.notes}</p>
          ) : (
            <p className="text-sm text-foreground-variant">—</p>
          )}
          {cardErrors.notes && <p className="mt-3 text-sm text-error">{cardErrors.notes}</p>}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function RecordHeader({
  title,
  badge,
  card,
  editingCard,
  savingCard,
  canEdit,
  onStartEdit,
  onCancelEdit,
  onSave,
  t,
}: {
  title: string;
  badge?: string;
  card: ClinicalCard;
  editingCard: ClinicalCard | null;
  savingCard: ClinicalCard | null;
  canEdit: boolean;
  onStartEdit: (card: ClinicalCard) => void;
  onCancelEdit: () => void;
  onSave: (card: ClinicalCard) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge && <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>}
      </div>
      {canEdit && (
        editingCard === card ? (
          <div className="flex items-center gap-2">
            <button type="button" className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={onCancelEdit} disabled={savingCard === card}>{t("common.cancel")}</button>
            <button type="button" className="min-h-11 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={() => onSave(card)} disabled={savingCard === card}>{savingCard === card ? t("common.saving") : t("common.save")}</button>
          </div>
        ) : (
          <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => onStartEdit(card)}>{t("common.edit")}</button>
        )
      )}
    </div>
  );
}
