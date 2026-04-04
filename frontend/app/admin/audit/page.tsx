"use client";

import { useQuery } from "@/hooks/useQuery";
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
  const { data, isLoading, error } = useQuery<AuditRow[]>(
    "/workflow/audit?limit=200",
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <ScrollText className="w-7 h-7 text-primary" />
          {t("admin.audit.title")}
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {t("admin.audit.subtitle")}
        </p>
      </div>

      <div className="surface-card p-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-error">{String(error)}</p>
        ) : !data?.length ? (
          <p className="text-sm text-on-surface-variant">—</p>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-outline-variant/20">
                <th className="pb-2 pr-2">Time</th>
                <th className="pb-2 pr-2">Domain</th>
                <th className="pb-2 pr-2">Action</th>
                <th className="pb-2 pr-2">Entity</th>
                <th className="pb-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-outline-variant/10 align-top"
                >
                  <td className="py-2 pr-2 whitespace-nowrap text-on-surface">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2">{row.domain}</td>
                  <td className="py-2 pr-2">{row.action}</td>
                  <td className="py-2 pr-2">
                    {row.entity_type}
                    {row.entity_id != null ? ` #${row.entity_id}` : ""}
                  </td>
                  <td className="py-2 text-on-surface-variant max-w-[240px] truncate font-mono">
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
