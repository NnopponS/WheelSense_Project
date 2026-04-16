"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import type { Patient } from "@/lib/types";

type Props = {
  /** Shared with the patient grid: one search string for quick-find API and list filtering. */
  search: string;
  onSearchChange: (value: string) => void;
};

export default function AdminPatientsQuickFind({ search, onSearchChange }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedPatientId, setSelectedPatientId] = useState("");

  const endpoint = useMemo(() => {
    const q = search.trim();
    return q
      ? `/patients?q=${encodeURIComponent(q)}&limit=100`
      : "/patients?limit=100";
  }, [search]);

  const { data: patients, isLoading } = useQuery({
    queryKey: ["admin", "patients", "quick-find", endpoint],
    queryFn: () => api.get<Patient[]>(endpoint),
    enabled: Boolean(endpoint),
    staleTime: getQueryStaleTimeMs(endpoint),
    refetchInterval: getQueryPollingMs(endpoint),
    retry: 3,
  });

  const listOptions = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        id: String(p.id),
        title: `${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`,
        subtitle: `#${p.id}`,
      })),
    [patients],
  );

  const emptyPool =
    !isLoading && (!patients || patients.length === 0) && !search.trim();
  const emptyNoMatch =
    !isLoading &&
    (patients?.length === 0) &&
    search.trim().length > 0 &&
    !selectedPatientId;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("patients.quickFindHint")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <SearchableListboxPicker
            inputId="admin-patients-quick-combobox"
            listboxId="admin-patients-quick-listbox"
            options={listOptions}
            search={search}
            onSearchChange={(v) => {
              onSearchChange(v);
              setSelectedPatientId("");
            }}
            searchPlaceholder={t("patients.quickFindPlaceholder")}
            selectedOptionId={selectedPatientId || null}
            onSelectOption={(id) => {
              const opt = listOptions.find((o) => o.id === id);
              setSelectedPatientId(id);
              onSearchChange(opt?.title ?? "");
            }}
            disabled={isLoading}
            listboxAriaLabel={t("patients.quickFindListLabel")}
            noMatchMessage={t("patients.quickFindNoMatch")}
            emptyStateMessage={emptyPool ? t("patients.empty") : null}
            emptyNoMatch={emptyNoMatch}
            listPresentation="portal"
            listboxZIndex={200}
            showTrailingClear
            trailingClearAriaLabel={t("patients.quickFindClear")}
            onTrailingClear={() => setSelectedPatientId("")}
          />
        </div>
        <button
          type="button"
          disabled={!selectedPatientId.trim() || isLoading}
          onClick={() => {
            const id = selectedPatientId.trim();
            if (!id) return;
            router.push(`/head-nurse/personnel/${id}`);
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white gradient-cta disabled:opacity-50 sm:min-w-[8.5rem]"
        >
          <UserRoundPlus className="h-4 w-4" aria-hidden />
          {t("patients.openPatientRecord")}
        </button>
      </div>
    </div>
  );
}
