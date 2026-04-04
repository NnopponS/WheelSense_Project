"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@/hooks/useQuery";
import type { Patient } from "@/lib/types";
import Link from "next/link";
import { ClipboardList, MessageSquare, NotebookPen, Users } from "lucide-react";

type CareTask = {
  id: number;
  patient_id: number | null;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
};

type RoleMessage = {
  id: number;
  patient_id: number | null;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type HandoverNote = {
  id: number;
  patient_id: number | null;
  priority: string;
  note: string;
  created_at: string;
};

export default function ObserverPatientsPage() {
  const [search, setSearch] = useState("");
  const { data: patients, isLoading } = useQuery<Patient[]>("/patients");
  const { data: tasks } = useQuery<CareTask[]>("/workflow/tasks?limit=100");
  const { data: messages } = useQuery<RoleMessage[]>("/workflow/messages?limit=100");
  const { data: handovers } = useQuery<HandoverNote[]>(
    "/workflow/handovers?limit=100",
  );

  const patientList = patients ?? [];
  const taskList = tasks ?? [];
  const messageList = messages ?? [];
  const handoverList = handovers ?? [];
  const filteredPatients = useMemo(() => {
    const base = patients ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return base;
    return base.filter((patient) => {
      const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
      const nickname = patient.nickname.toLowerCase();
      return fullName.includes(query) || nickname.includes(query);
    });
  }, [patients, search]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">My patients</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Track notes, tasks, and role messages for assigned patient care.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient"
            className="w-full bg-surface-container-low rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Users} label="Assigned patients" value={patientList.length} />
        <SummaryCard
          icon={ClipboardList}
          label="Open tasks"
          value={taskList.filter((task) => task.status !== "completed").length}
        />
        <SummaryCard
          icon={MessageSquare}
          label="Unread messages"
          value={messageList.filter((message) => !message.is_read).length}
        />
        <SummaryCard
          icon={NotebookPen}
          label="Recent handovers"
          value={handoverList.length}
        />
      </div>

      {filteredPatients.length === 0 ? (
        <div className="surface-card p-6 text-center text-on-surface-variant text-sm">
          No patients match your search.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPatients.map((patient) => {
            const patientTasks = taskList.filter((task) => task.patient_id === patient.id);
            const unreadMessages = messageList.filter(
              (message) => message.patient_id === patient.id && !message.is_read,
            );
            const patientHandovers = handoverList.filter(
              (handover) => handover.patient_id === patient.id,
            );

            return (
              <Link
                key={patient.id}
                href={`/observer/patients/${patient.id}`}
                className="block surface-card p-4 hover:bg-surface-container-low transition-smooth"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-on-surface truncate">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {patient.nickname || "No nickname"} · Care level {patient.care_level}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      patient.care_level === "critical"
                        ? "care-critical"
                        : patient.care_level === "special"
                          ? "care-special"
                          : "care-normal"
                    }`}
                  >
                    {patient.care_level}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                  <MetricBadge label="Tasks" value={patientTasks.length} />
                  <MetricBadge label="Unread msgs" value={unreadMessages.length} />
                  <MetricBadge label="Handovers" value={patientHandovers.length} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-on-surface-variant text-sm">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-3 py-2">
      <p className="text-on-surface-variant">{label}</p>
      <p className="text-sm font-semibold text-on-surface mt-0.5">{value}</p>
    </div>
  );
}
