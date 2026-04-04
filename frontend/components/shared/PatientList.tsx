"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import EmptyState from "@/components/EmptyState";
import { Search, Users } from "lucide-react";
import type { Patient } from "@/lib/types";
import { useState } from "react";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";

type Props = {
  patients: Patient[] | null | undefined;
  isLoading: boolean;
  basePath: string;
  searchPlaceholderKey?: "patients.search";
  emptyMessageKey?: "patients.empty";
};

export default function PatientList({
  patients,
  isLoading,
  basePath,
  searchPlaceholderKey = "patients.search",
  emptyMessageKey = "patients.empty",
}: Props) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const [search, setSearch] = useState("");

  const filtered = patients?.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    return <EmptyState icon={Users} message={t(emptyMessageKey)} />;
  }

  return (
    <>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
        <input
          type="text"
          placeholder={t(searchPlaceholderKey)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field input-field--leading-icon py-2.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((patient) => (
          <Link
            key={patient.id}
            href={`${basePath}/${patient.id}`}
            className="surface-card p-5 flex items-center gap-4 hover:shadow-elevated transition-smooth"
          >
            <div className="w-12 h-12 rounded-full gradient-cta flex items-center justify-center text-white font-bold shrink-0">
              {(patient.first_name?.[0] || "P").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface truncate">
                {patient.first_name} {patient.last_name}
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {t("patients.age")}: {ageYears(patient.date_of_birth, nowMs) ?? "—"}{" "}
                {t("patients.years")}
              </p>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                patient.care_level === "critical"
                  ? "care-critical"
                  : patient.care_level === "special"
                    ? "care-special"
                    : "care-normal"
              }`}
            >
              {patient.care_level || "normal"}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
