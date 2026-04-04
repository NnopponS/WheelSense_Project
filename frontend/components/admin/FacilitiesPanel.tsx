"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import type { Facility } from "@/lib/types";
import EmptyState from "@/components/EmptyState";
import { Building2, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";

type FormState = {
  name: string;
  address: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  description: "",
};

export default function FacilitiesPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const { t } = useTranslation();
  const { data: facilities, isLoading, refetch } = useQuery<Facility[]>("/facilities");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      (facilities ?? []).filter((f) =>
        f.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [facilities, search],
  );

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  function startEdit(facility: Facility) {
    setEditingId(facility.id);
    setForm({
      name: facility.name ?? "",
      address: facility.address ?? "",
      description: facility.description ?? "",
    });
    setMessage(null);
  }

  async function submitForm() {
    const name = form.name.trim();
    if (!name) return;
    setSubmitting(true);
    setMessage(null);
    try {
      if (editingId === null) {
        await api.post<Facility>("/facilities", {
          name,
          address: form.address.trim(),
          description: form.description.trim(),
          config: {},
        });
      } else {
        await api.patch<Facility>(`/facilities/${editingId}`, {
          name,
          address: form.address.trim(),
          description: form.description.trim(),
        });
      }
      await refetch();
      onChanged?.();
      setForm(EMPTY_FORM);
      setEditingId(null);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save facility");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeFacility(id: number) {
    if (!window.confirm("Delete this facility?")) return;
    setMessage(null);
    try {
      await api.delete<void>(`/facilities/${id}`);
      await refetch();
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not delete facility");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
        <input
          type="text"
          placeholder={t("facilities.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field input-field--leading-icon py-2.5 text-sm w-full"
        />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
        <div className="surface-card p-4 space-y-3 w-full xl:order-2 xl:w-[min(100%,340px)] xl:shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-on-surface">
              {editingId === null ? t("facilities.addNew") : "Edit facility"}
            </p>
            {editingId !== null && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={startCreate}
              >
                New
              </button>
            )}
          </div>
          <input
            className="input-field text-sm w-full"
            placeholder={t("floorplan.buildingName")}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="input-field text-sm w-full"
            placeholder={t("floorplan.addressOptional")}
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
          />
          <input
            className="input-field text-sm w-full"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <button
            type="button"
            className="w-full gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            onClick={() => void submitForm()}
            disabled={submitting || !form.name.trim()}
          >
            <Plus className="w-4 h-4" />
            {submitting ? "…" : editingId === null ? t("facilities.addNew") : "Update"}
          </button>
        </div>

        <div className="min-w-0 flex-1 xl:order-1">
          {message && (
            <p className="text-sm text-on-surface-variant mb-3">{message}</p>
          )}

          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} message={t("facilities.empty")} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
              {filtered.map((facility) => (
            <div key={facility.id} className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface truncate">{facility.name}</p>
                    {facility.address && (
                      <p className="text-xs text-on-surface-variant flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-outline" />
                        <span className="truncate">{facility.address}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-2 rounded-lg hover:bg-surface-container-low"
                    onClick={() => startEdit(facility)}
                    aria-label="Edit facility"
                  >
                    <Pencil className="w-4 h-4 text-on-surface-variant" />
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-lg hover:bg-error-container/60"
                    onClick={() => void removeFacility(facility.id)}
                    aria-label="Delete facility"
                  >
                    <Trash2 className="w-4 h-4 text-error" />
                  </button>
                </div>
              </div>
              {facility.description && (
                <p className="text-xs text-on-surface-variant">{facility.description}</p>
              )}
            </div>
          ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
