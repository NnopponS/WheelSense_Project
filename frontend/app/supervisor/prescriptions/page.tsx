"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { type Patient, type Prescription, type Specialist } from "@/lib/types";
import { Pill, Plus } from "lucide-react";

export default function SupervisorPrescriptionsPage() {
  const { data: prescriptions, isLoading, refetch } = useQuery<Prescription[]>(
    "/future/prescriptions",
  );
  const { data: patients } = useQuery<Patient[]>("/patients");
  const { data: specialists } = useQuery<Specialist[]>("/future/specialists");

  const [form, setForm] = useState({
    patient_id: "",
    specialist_id: "",
    medication_name: "",
    dosage: "",
    frequency: "",
    instructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patientMap = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );

  async function createPrescription() {
    if (!form.patient_id || !form.medication_name || !form.dosage || !form.frequency) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/future/prescriptions", {
        patient_id: Number(form.patient_id),
        specialist_id: form.specialist_id ? Number(form.specialist_id) : null,
        medication_name: form.medication_name,
        dosage: form.dosage,
        frequency: form.frequency,
        instructions: form.instructions,
      });
      setForm({
        patient_id: "",
        specialist_id: "",
        medication_name: "",
        dosage: "",
        frequency: "",
        instructions: "",
      });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create prescription");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Prescription Management</h2>
        <p className="text-sm text-on-surface-variant">
          Create and monitor medication plans linked to specialists and patients.
        </p>
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <select
            className="input-field"
            value={form.patient_id}
            onChange={(event) => setForm((prev) => ({ ...prev, patient_id: event.target.value }))}
          >
            <option value="">Select patient</option>
            {(patients ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.first_name} {patient.last_name}
              </option>
            ))}
          </select>
          <select
            className="input-field"
            value={form.specialist_id}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, specialist_id: event.target.value }))
            }
          >
            <option value="">Select specialist</option>
            {(specialists ?? []).map((specialist) => (
              <option key={specialist.id} value={specialist.id}>
                {specialist.first_name} {specialist.last_name} ({specialist.specialty})
              </option>
            ))}
          </select>
          <input
            className="input-field"
            placeholder="Medication"
            value={form.medication_name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, medication_name: event.target.value }))
            }
          />
          <input
            className="input-field"
            placeholder="Dosage"
            value={form.dosage}
            onChange={(event) => setForm((prev) => ({ ...prev, dosage: event.target.value }))}
          />
          <input
            className="input-field"
            placeholder="Frequency"
            value={form.frequency}
            onChange={(event) => setForm((prev) => ({ ...prev, frequency: event.target.value }))}
          />
          <input
            className="input-field"
            placeholder="Instructions"
            value={form.instructions}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, instructions: event.target.value }))
            }
          />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="button"
          className="gradient-cta px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          disabled={saving}
          onClick={() => {
            void createPrescription();
          }}
        >
          <Plus className="w-4 h-4" />
          {saving ? "Saving..." : "Create prescription"}
        </button>
      </div>

      <div className="surface-card p-4">
        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading prescriptions...</p>
        ) : !prescriptions || prescriptions.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No prescriptions found.</p>
        ) : (
          <div className="space-y-2">
            {prescriptions.map((item) => {
              const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
              return (
                <div key={item.id} className="rounded-lg border border-outline-variant/20 p-3">
                  <p className="font-medium text-on-surface inline-flex items-center gap-2">
                    <Pill className="w-4 h-4 text-primary" />
                    {item.medication_name} ({item.dosage})
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {patient
                      ? `${patient.first_name} ${patient.last_name}`
                      : "No linked patient"}{" "}
                    • {item.frequency} • {item.status}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
