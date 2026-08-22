"use client";

import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/components/layout/AppPage";
import { DataState } from "@/components/layout/DataState";
import { ResponsiveDataView } from "@/components/shared/ResponsiveDataView";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";

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
    <AppPage
      width="content"
      title={t("admin.audit.title")}
      description={t("admin.audit.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/admin" },
        { label: t("admin.audit.title") },
      ]}
    >
      {isLoading ? (
        <DataState kind="loading" title={t("common.loading")} />
      ) : error ? (
        <DataState kind="error" title={t("common.requestFailed")} description={String(error)} />
      ) : !data?.length ? (
        <DataState kind="empty" title={t("admin.audit.empty")} />
      ) : (
        <ResponsiveDataView
          desktopLabel={t("common.tableView")}
          mobileLabel={t("common.cardView")}
          desktop={
            <div className="surface-card overflow-x-auto p-4">
              <table className="w-full text-sm leading-snug">
                <thead>
                  <tr className="border-b border-outline-variant/20 text-left text-foreground-variant">
                    <th className="pb-3 pr-3 font-medium">{t("admin.audit.time")}</th>
                    <th className="pb-3 pr-3 font-medium">{t("admin.audit.domain")}</th>
                    <th className="pb-3 pr-3 font-medium">{t("admin.audit.action")}</th>
                    <th className="pb-3 pr-3 font-medium">{t("admin.audit.entity")}</th>
                    <th className="pb-3 font-medium">{t("admin.audit.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-outline-variant/10 align-top">
                      <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-foreground">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="py-3 pr-3">{row.domain}</td>
                      <td className="py-3 pr-3">{row.action}</td>
                      <td className="py-3 pr-3">
                        {row.entity_type}{row.entity_id != null ? ` #${row.entity_id}` : ""}
                      </td>
                      <td className="max-w-[min(28rem,45vw)] truncate py-3 font-mono text-sm text-foreground-variant">
                        {JSON.stringify(row.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          mobile={
            <div className="space-y-3">
              {data.map((row) => (
                <article key={row.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-foreground">{row.action}</h2>
                    <time className="text-sm tabular-nums text-muted-foreground" dateTime={row.created_at}>
                      {formatDateTime(row.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {row.domain} · {row.entity_type}{row.entity_id != null ? ` #${row.entity_id}` : ""}
                  </p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-low p-3 text-sm text-foreground">
                    {JSON.stringify(row.details, null, 2)}
                  </pre>
                </article>
              ))}
            </div>
          }
        />
      )}
    </AppPage>
  );
}
