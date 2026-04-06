"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { Plus, Trash2, X } from "lucide-react";
import type { Patient, PatientMedication, PatientPastSurgery } from "@/lib/types";
import { splitList } from "@/lib/patientFormParse";

const CARE_LEVELS = ["normal", "special", "critical"] as const;
const MOBILITY = ["wheelchair", "walker", "independent"] as const;
const BLOOD_TYPES = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [careLevel, setCareLevel] = useState<string>("normal");
  const [mobilityType, setMobilityType] = useState<string>("wheelchair");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [chronicRaw, setChronicRaw] = useState("");
  const [allergiesRaw, setAllergiesRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [medications, setMedications] = useState<PatientMedication[]>([
    { name: "", dosage: "", frequency: "", instructions: "" },
  ]);
  const [surgeries, setSurgeries] = useState<PatientPastSurgery[]>([
    { procedure: "", facility: "", year: "" },
  ]);
  const [ecName, setEcName] = useState("");
  const [ecRelationship, setEcRelationship] = useState("");
  const [ecPhone, setEcPhone] = useState("");

  const resetForm = useCallback(() => {
    setFirstName("");
    setLastName("");
    setNickname("");
    setDateOfBirth("");
    setGender("");
    setCareLevel("normal");
    setMobilityType("wheelchair");
    setHeightCm("");
    setWeightKg("");
    setBloodType("");
    setChronicRaw("");
    setAllergiesRaw("");
    setNotes("");
    setMedications([{ name: "", dosage: "", frequency: "", instructions: "" }]);
    setSurgeries([{ procedure: "", facility: "", year: "" }]);
    setEcName("");
    setEcRelationship("");
    setEcPhone("");
    setFormError("");
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetForm();
    onClose();
  }, [submitting, resetForm, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const addMedRow = () =>
    setMedications((m) => [...m, { name: "", dosage: "", frequency: "", instructions: "" }]);
  const removeMedRow = (i: number) =>
    setMedications((m) => (m.length <= 1 ? m : m.filter((_, j) => j !== i)));

  const addSxRow = () =>
    setSurgeries((s) => [...s, { procedure: "", facility: "", year: "" }]);
  const removeSxRow = (i: number) =>
    setSurgeries((s) => (s.length <= 1 ? s : s.filter((_, j) => j !== i)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      setFormError(t("patients.nameRequired"));
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const height =
        heightCm.trim() === "" ? null : Number.parseFloat(heightCm.replace(",", "."));
      const weight =
        weightKg.trim() === "" ? null : Number.parseFloat(weightKg.replace(",", "."));
      const medPayload = medications
        .filter((row) => (row.name || "").trim())
        .map((row) => ({
          name: (row.name || "").trim(),
          dosage: (row.dosage || "").trim(),
          frequency: (row.frequency || "").trim(),
          instructions: (row.instructions || "").trim(),
        }));
      const sxPayload = surgeries
        .filter((row) => (row.procedure || "").trim())
        .map((row) => ({
          procedure: (row.procedure || "").trim(),
          facility: (row.facility || "").trim(),
          year: row.year === "" || row.year == null ? null : Number(row.year) || row.year,
        }));

      const payload: Record<string, unknown> = {
        first_name: fn,
        last_name: ln,
        nickname: nickname.trim(),
        date_of_birth: dateOfBirth.trim() || null,
        gender: gender.trim(),
        care_level: careLevel,
        mobility_type: mobilityType,
        height_cm: height != null && !Number.isNaN(height) ? height : null,
        weight_kg: weight != null && !Number.isNaN(weight) ? weight : null,
        blood_type: bloodType,
        medical_conditions: splitList(chronicRaw),
        allergies: splitList(allergiesRaw),
        medications: medPayload,
        past_surgeries: sxPayload,
        notes: notes.trim(),
      };

      const created = await api.post<Patient>("/patients", payload);
      if (ecName.trim() && ecPhone.trim()) {
        await api.post(`/patients/${created.id}/contacts`, {
          contact_type: "emergency",
          name: ecName.trim(),
          relationship: ecRelationship.trim(),
          phone: ecPhone.trim(),
          is_primary: true,
        });
      }
      await onCreated();
      resetForm();
      onClose();
      router.push(`/admin/patients/${created.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.createError");
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="surface-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-outline-variant/25 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-patient-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low px-6 py-4">
          <h3 id="add-patient-title" className="text-lg font-semibold text-on-surface">
            {t("patients.createTitle")}
          </h3>
          <button
            type="button"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high shrink-0"
            onClick={handleClose}
            aria-label={t("patients.createCancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <FormSection title={t("patients.formSectionIdentity")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t("patients.firstName")} *`}>
                <input
                  className="input-field text-sm w-full"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={`${t("patients.lastName")} *`}>
                <input
                  className="input-field text-sm w-full"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={t("patients.nickname")}>
                <input
                  className="input-field text-sm w-full"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.dateOfBirth")}>
                <input
                  type="date"
                  className="input-field text-sm w-full"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.gender")}>
                <select
                  className="input-field text-sm w-full"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">{t("patients.genderUnset")}</option>
                  <option value="male">{t("patients.genderMale")}</option>
                  <option value="female">{t("patients.genderFemale")}</option>
                  <option value="other">{t("patients.genderOther")}</option>
                </select>
              </Field>
              <Field label={t("patients.careLevel")}>
                <select
                  className="input-field text-sm w-full"
                  value={careLevel}
                  onChange={(e) => setCareLevel(e.target.value)}
                  disabled={submitting}
                >
                  {CARE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("patients.mobilityType")} className="sm:col-span-2">
                <select
                  className="input-field text-sm w-full"
                  value={mobilityType}
                  onChange={(e) => setMobilityType(e.target.value)}
                  disabled={submitting}
                >
                  {MOBILITY.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionPhysical")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("patients.heightCm")}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field text-sm w-full"
                  placeholder="178"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.weightKg")}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field text-sm w-full"
                  placeholder="82"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.bloodType")}>
                <select
                  className="input-field text-sm w-full"
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                  disabled={submitting}
                >
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt || "unset"} value={bt}>
                      {bt || "—"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionMedical")}>
            <Field label={t("patients.chronicConditionsHint")}>
              <textarea
                className="input-field text-sm w-full min-h-[72px]"
                placeholder={t("patients.chronicPlaceholder")}
                value={chronicRaw}
                onChange={(e) => setChronicRaw(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label={t("patients.allergiesHint")}>
              <textarea
                className="input-field text-sm w-full min-h-[56px]"
                placeholder={t("patients.allergiesPlaceholder")}
                value={allergiesRaw}
                onChange={(e) => setAllergiesRaw(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </FormSection>

          <FormSection title={t("patients.formSectionSurgeries")}>
            <div className="space-y-3">
              {surgeries.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-lg border border-outline-variant/15 p-3"
                >
                  <div className="sm:col-span-5">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryProcedure")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      value={row.procedure || ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, procedure: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryFacility")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      value={row.facility || ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, facility: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryYear")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      inputMode="numeric"
                      placeholder="2021"
                      value={row.year ?? ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, year: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
                      onClick={() => removeSxRow(i)}
                      disabled={submitting}
                      aria-label={t("patients.removeRow")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                onClick={addSxRow}
                disabled={submitting}
              >
                <Plus className="w-4 h-4" />
                {t("patients.addSurgeryRow")}
              </button>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionMedications")}>
            <div className="space-y-3">
              {medications.map((row, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-outline-variant/15 p-3 space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Field label={t("patients.medName")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.name || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                    <Field label={t("patients.medDosage")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.dosage || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, dosage: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                    <Field label={t("patients.medFrequency")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.frequency || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, frequency: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                  </div>
                  <Field label={t("patients.medInstructions")}>
                    <input
                      className="input-field text-sm w-full"
                      placeholder={t("patients.medInstructionsPlaceholder")}
                      value={row.instructions || ""}
                      onChange={(e) =>
                        setMedications((m) =>
                          m.map((r, j) => (j === i ? { ...r, instructions: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-error"
                      onClick={() => removeMedRow(i)}
                      disabled={submitting}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("patients.removeRow")}
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                onClick={addMedRow}
                disabled={submitting}
              >
                <Plus className="w-4 h-4" />
                {t("patients.addMedicationRow")}
              </button>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionEmergency")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("patients.ecName")}>
                <input
                  className="input-field text-sm w-full"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.ecRelationship")}>
                <input
                  className="input-field text-sm w-full"
                  placeholder={t("patients.ecRelationshipPlaceholder")}
                  value={ecRelationship}
                  onChange={(e) => setEcRelationship(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.ecPhone")}>
                <input
                  className="input-field text-sm w-full"
                  type="tel"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionNotes")}>
            <textarea
              className="input-field text-sm w-full min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </FormSection>

          {formError && (
            <p className="text-sm text-error" role="alert">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-outline-variant/30 text-on-surface"
              onClick={handleClose}
              disabled={submitting}
            >
              {t("patients.createCancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-semibold gradient-cta disabled:opacity-50"
            >
              {submitting ? "…" : t("patients.createSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-on-surface border-b border-outline-variant/15 pb-2">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs text-on-surface-variant block mb-1">{label}</label>
      {children}
    </div>
  );
}
