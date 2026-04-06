"use client";

import { useMemo, useState } from "react";
import { UserRoundPlus, Unlink2 } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import type { DevicePatientLink, Patient } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

type TFn = (key: TranslationKey) => string;

interface Props {
  deviceId: string;
  workspaceId: number | undefined;
  linkedPatient: DevicePatientLink | null;
  defaultDeviceRole: string;
  t: TFn;
  onMutate: () => Promise<void> | void;
}

export default function PatientLinkSection({
  deviceId,
  workspaceId,
  linkedPatient,
  defaultDeviceRole,
  t,
  onMutate,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patientEndpoint = useMemo(() => {
    const q = search.trim();
    const path = q ? `/patients?q=${encodeURIComponent(q)}&limit=50` : "/patients?limit=50";
    return withWorkspaceScope(path, workspaceId);
  }, [search, workspaceId]);
  const { data: patients, isLoading: patientsLoading } = useQuery<Patient[]>(patientEndpoint);

  const listOptions = useMemo(() => {
    const rows = patients ?? [];
    return rows.map((p) => ({
      id: String(p.id),
      title: `${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`,
      subtitle: `#${p.id}`,
    }));
  }, [patients]);

  const emptyPool =
    !patientsLoading && (!patients || patients.length === 0) && !search.trim();
  /** After a pick, `search` is the label but `GET /patients?q=…` may return []; do not keep list "open" for empty-no-match in that state. */
  const emptyNoMatch =
    !patientsLoading &&
    (patients?.length === 0) &&
    search.trim().length > 0 &&
    !selectedPatientId;

  async function assignPatient() {
    const target = Number(selectedPatientId);
    if (!target || !workspaceId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = withWorkspaceScope(`/devices/${encodeURIComponent(deviceId)}/patient`, workspaceId);
      if (!path) return;
      await api.post(path, {
        patient_id: target,
        device_role: defaultDeviceRole,
      });
      setMessage(t("devicesDetail.saved"));
      setSelectedPatientId("");
      setSearch("");
      await onMutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlinkPatient() {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = withWorkspaceScope(`/devices/${encodeURIComponent(deviceId)}/patient`, workspaceId);
      if (!path) return;
      await api.post(path, {
        patient_id: null,
        device_role: defaultDeviceRole,
      });
      setMessage(t("devicesDetail.saved"));
      await onMutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectedRow = useMemo(
    () => (patients ?? []).find((p) => String(p.id) === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-on-surface">{t("devicesDetail.patient")}</h4>
      {linkedPatient ? (
        <div className="rounded-xl bg-surface-container-low p-2.5 text-sm text-on-surface flex items-center justify-between gap-2">
          <span>
            {linkedPatient.patient_name}{" "}
            <span className="text-on-surface-variant text-xs">({linkedPatient.device_role})</span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlinkPatient()}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border border-outline-variant/30"
          >
            <Unlink2 className="w-3.5 h-3.5" />
            {t("devicesDetail.unlink")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant">{t("devicesDetail.noPatient")}</p>
      )}

      <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-3 space-y-3">
        <p className="text-xs text-on-surface-variant">{t("devicesDetail.linkPatientHint")}</p>
        <SearchableListboxPicker
          inputId="device-detail-patient-combobox"
          listboxId="device-detail-patient-listbox"
          options={listOptions}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("devicesDetail.searchPatient")}
          selectedOptionId={selectedPatientId || null}
          onSelectOption={(id) => {
            const opt = listOptions.find((o) => o.id === id);
            setSelectedPatientId(id);
            setSearch(opt?.title ?? "");
          }}
          disabled={busy || patientsLoading}
          listboxAriaLabel={t("devicesDetail.selectPatient")}
          noMatchMessage={t("devicesDetail.noPatientsMatchSearch")}
          emptyStateMessage={emptyPool ? t("patients.empty") : null}
          emptyNoMatch={emptyNoMatch}
          listPresentation="portal"
          listboxZIndex={200}
        />

        {selectedPatientId && selectedRow ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-on-surface">
            <span className="truncate font-medium">
              {t("patients.deviceSelected")}:{" "}
              {`${selectedRow.first_name} ${selectedRow.last_name}`.trim() || `#${selectedRow.id}`}
            </span>
            <button
              type="button"
              className="ml-auto shrink-0 font-semibold text-primary hover:underline"
              onClick={() => {
                setSelectedPatientId("");
                setSearch("");
              }}
              disabled={busy}
            >
              {t("patients.clearDeviceSelection")}
            </button>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || !selectedPatientId}
            onClick={() => void assignPatient()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold gradient-cta disabled:opacity-50"
          >
            <UserRoundPlus className="w-4 h-4" />
            {t("devicesDetail.link")}
          </button>
        </div>
      </div>
      {message ? <p className="text-xs text-primary">{message}</p> : null}
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </section>
  );
}
