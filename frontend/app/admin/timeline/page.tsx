"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Clock, Circle } from "lucide-react";
import type { Patient } from "@/lib/types";
import { useState } from "react";

interface TimelineEvent {
  id: number;
  patient_id: number;
  event_type: string;
  description: string;
  created_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  alert: "bg-critical text-white",
  motion: "bg-info text-white",
  vital: "bg-success text-white",
  location: "bg-warning text-white",
  system: "bg-outline text-white",
};

export default function TimelinePage() {
  const { t } = useTranslation();
  const { data: patients } = useQuery<Patient[]>("/patients");
  const [selectedPatient, setSelectedPatient] = useState<string>("all");
  const endpoint =
    selectedPatient === "all"
      ? "/timeline"
      : `/timeline?patient_id=${selectedPatient}`;
  const { data: events, isLoading } = useQuery<TimelineEvent[]>(endpoint);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("timeline.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("timeline.subtitle")}</p>
      </div>

      {/* Patient filter */}
      <select
        value={selectedPatient}
        onChange={(e) => setSelectedPatient(e.target.value)}
        className="input-field max-w-xs py-2.5 text-sm"
      >
        <option value="all">{t("timeline.allPatients")}</option>
        {patients?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.first_name} {p.last_name}
          </option>
        ))}
      </select>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !events || events.length === 0 ? (
        <EmptyState icon={Clock} message={t("timeline.empty")} />
      ) : (
        <div className="relative pl-8">
          {/* Vertical line */}
          <div className="absolute left-3.5 top-2 bottom-2 w-px bg-outline-variant/30" />

          <div className="space-y-4">
            {events.map((event) => (
              <div key={event.id} className="relative flex gap-4">
                <div
                  className={`absolute left-[-20px] w-7 h-7 rounded-full flex items-center justify-center ${
                    EVENT_COLORS[event.event_type] || EVENT_COLORS.system
                  }`}
                >
                  <Circle className="w-3 h-3" fill="currentColor" />
                </div>
                <div className="surface-card p-4 flex-1 ml-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      {event.event_type}
                    </span>
                    <span className="text-xs text-outline">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
