"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { type Specialist } from "@/lib/types";
import { Stethoscope, Plus } from "lucide-react";

export default function HeadNurseSpecialistsPage() {
  const { data, isLoading, refetch } = useQuery<Specialist[]>("/future/specialists");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    specialty: "",
    license_number: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSpecialist() {
    if (!form.first_name || !form.last_name || !form.specialty) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/future/specialists", form);
      setForm({ first_name: "", last_name: "", specialty: "", license_number: "" });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create specialist");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Specialist Directory</h2>
        <p className="text-sm text-on-surface-variant">
          Maintain specialist records used by prescription and referral workflows.
        </p>
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="grid md:grid-cols-4 gap-3">
          <input
            className="input-field"
            placeholder="First name"
            value={form.first_name}
            onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
          />
          <input
            className="input-field"
            placeholder="Last name"
            value={form.last_name}
            onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
          />
          <input
            className="input-field"
            placeholder="Specialty"
            value={form.specialty}
            onChange={(event) => setForm((prev) => ({ ...prev, specialty: event.target.value }))}
          />
          <input
            className="input-field"
            placeholder="License #"
            value={form.license_number}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, license_number: event.target.value }))
            }
          />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="button"
          className="gradient-cta px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          disabled={saving}
          onClick={() => {
            void createSpecialist();
          }}
        >
          <Plus className="w-4 h-4" />
          {saving ? "Saving..." : "Add specialist"}
        </button>
      </div>

      <div className="surface-card p-4">
        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading specialists...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No specialists available.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.map((item) => (
              <div key={item.id} className="rounded-lg border border-outline-variant/20 p-3">
                <p className="font-medium text-on-surface inline-flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  {item.first_name} {item.last_name}
                </p>
                <p className="text-sm text-on-surface-variant mt-1">
                  {item.specialty} {item.license_number ? `• ${item.license_number}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
