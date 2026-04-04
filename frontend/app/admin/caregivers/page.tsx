"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { UserCog, Search, Plus, Phone, Mail } from "lucide-react";
import { useState } from "react";

interface Caregiver {
  id: number;
  user_id: number;
  specialization?: string;
  license_number?: string;
  phone?: string;
  email?: string;
  username?: string;
}

export default function CaregiversPage() {
  const { t } = useTranslation();
  const { data: caregivers, isLoading } = useQuery<Caregiver[]>("/caregivers");
  const [search, setSearch] = useState("");

  const filtered = caregivers?.filter((c) =>
    (c.username || c.specialization || "")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-on-surface">{t("caregivers.title")}</h2>
        <button className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-smooth cursor-pointer">
          <Plus className="w-4 h-4" />
          {t("caregivers.addNew")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
        <input
          type="text"
          placeholder={t("caregivers.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field input-field--leading-icon py-2.5 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <EmptyState icon={UserCog} message={t("caregivers.empty")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((cg) => (
            <div key={cg.id} className="surface-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full gradient-cta flex items-center justify-center text-white font-bold shrink-0">
                  {(cg.username?.[0] || "C").toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-on-surface text-sm">
                    {cg.username || `Caregiver #${cg.id}`}
                  </p>
                  {cg.specialization && (
                    <p className="text-xs text-on-surface-variant">
                      {cg.specialization}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-on-surface-variant">
                {cg.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-outline" />
                    {cg.phone}
                  </div>
                )}
                {cg.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-outline" />
                    {cg.email}
                  </div>
                )}
                {cg.license_number && (
                  <p className="text-outline">License: {cg.license_number}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
