"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Building2, Search, Plus, MapPin, DoorOpen } from "lucide-react";
import { useState } from "react";

interface Facility {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  total_rooms?: number;
  is_active: boolean;
}

export default function FacilitiesPage() {
  const { t } = useTranslation();
  const { data: facilities, isLoading } = useQuery<Facility[]>("/facilities");
  const [search, setSearch] = useState("");

  const filtered = facilities?.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-on-surface">{t("facilities.title")}</h2>
        <button className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-smooth cursor-pointer">
          <Plus className="w-4 h-4" />
          {t("facilities.addNew")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
        <input
          type="text"
          placeholder={t("facilities.search")}
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
        <EmptyState icon={Building2} message={t("facilities.empty")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((facility) => (
            <div key={facility.id} className="surface-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary-fixed flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-on-surface">{facility.name}</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      facility.is_active ? "care-normal" : "severity-warning"
                    }`}
                  >
                    {facility.is_active ? t("common.active") : t("common.inactive")}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-on-surface-variant">
                {facility.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-outline" />
                    {facility.address}
                  </div>
                )}
                {facility.total_rooms !== undefined && (
                  <div className="flex items-center gap-2">
                    <DoorOpen className="w-3 h-3 text-outline" />
                    {facility.total_rooms} {t("facilities.rooms")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
