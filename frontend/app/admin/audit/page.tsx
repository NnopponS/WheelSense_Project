"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { ScrollText } from "lucide-react";

interface AuditRow {
  id: number;
  domain: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
}

export default function AdminAuditPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit", "workflow", { limit: 200 }],
    queryFn: () => api.get<AuditRow[]>("/workflow/audit?limit=200"),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="w-7 h-7 text-primary" />
          {t("admin.audit.title")}
        </h2>
        <p className="text-sm text-foreground-variant mt-1">
          {t("admin.audit.subtitle")}
        </p>
      </div>

      <div className="surface-card p-3 sm:p-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-error">{String(error)}</p>
        ) : !data?.length ? (
          <p className="text-sm text-foreground-variant">—</p>
        ) : (
          <table className="w-full text-sm sm:text-sm leading-snug">
            <thead>
              <tr className="text-left text-foreground-variant border-b border-outline-variant/20">
                <th className="pb-1.5 pr-2 font-medium">Time</th>
                <th className="pb-1.5 pr-2 font-medium">Domain</th>
                <th className="pb-1.5 pr-2 font-medium">Action</th>
                <th className="pb-1.5 pr-2 font-medium">Entity</th>
                <th className="pb-1.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-outline-variant/10 align-top"
                >
                  <td className="py-1.5 pr-2 whitespace-nowrap text-foreground tabular-nums">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-2">{row.domain}</td>
                  <td className="py-1.5 pr-2">{row.action}</td>
                  <td className="py-1.5 pr-2">
                    {row.entity_type}
                    {row.entity_id != null ? ` #${row.entity_id}` : ""}
                  </td>
                  <td className="py-1.5 text-foreground-variant max-w-[min(28rem,45vw)] truncate font-mono text-sm sm:text-sm">
                    {JSON.stringify(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
