"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { HeadNurseStaffMemberSheet } from "@/components/head-nurse/HeadNurseStaffMemberSheet";
import { api } from "@/lib/api";
import type { ShiftChecklistWorkspaceRow } from "@/lib/api/task-scope-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { User } from "@/lib/types";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatRelativeTime } from "@/lib/datetime";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const ROLE_TO_I18N: Record<string, TranslationKey> = {
  admin: "personnel.role.admin",
  head_nurse: "personnel.role.headNurse",
  supervisor: "personnel.role.supervisor",
  observer: "personnel.role.observer",
  patient: "personnel.role.patient",
};

function formatStaffRole(role: string, t: (key: TranslationKey) => string): string {
  const key = ROLE_TO_I18N[role];
  return key ? t(key) : role.replace(/_/g, " ");
}

export function ShiftChecklistWorkspaceClient() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [shiftDate, setShiftDate] = useState(() => utcShiftDateString());
  const [sheetRow, setSheetRow] = useState<ShiftChecklistWorkspaceRow | null>(null);

  const canEditTemplates = me?.role === "admin" || me?.role === "head_nurse";

  const query = useQuery({
    queryKey: ["shift-checklist", "workspace", shiftDate],
    queryFn: () => api.listShiftChecklistWorkspace({ shift_date: shiftDate }),
  });

  const linkedUserForSheet: User | null = useMemo(() => {
    if (!sheetRow || !me) return null;
    return {
      id: sheetRow.user_id,
      workspace_id: me.workspace_id,
      username: sheetRow.username,
      role: sheetRow.role as User["role"],
      is_active: true,
      caregiver_id: null,
      patient_id: null,
      created_at: "",
      updated_at: "",
    };
  }, [sheetRow, me]);

  const caregiverForSheet = sheetRow
    ? { id: sheetRow.user_id, fullName: sheetRow.username, role: sheetRow.role }
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            {t("shiftChecklistWorkspace.title")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("shiftChecklistWorkspace.title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("shiftChecklistWorkspace.subtitle")}</p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <Label htmlFor="shift-date">{t("shiftChecklistWorkspace.dateLabel")}</Label>
          <Input
            id="shift-date"
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("shiftChecklistWorkspace.staff")}</CardTitle>
          <CardDescription>
            {canEditTemplates ? t("shiftChecklistWorkspace.cardHintEditable") : t("shiftChecklistWorkspace.cardHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isError ? (
            <p className="text-sm text-destructive">{t("shiftChecklistWorkspace.loadError")}</p>
          ) : query.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            (query.data ?? []).map((row) => (
              <div
                key={row.user_id}
                role={canEditTemplates ? "button" : undefined}
                tabIndex={canEditTemplates ? 0 : undefined}
                onClick={() => {
                  if (canEditTemplates) setSheetRow(row);
                }}
                onKeyDown={(e) => {
                  if (!canEditTemplates) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSheetRow(row);
                  }
                }}
                className={cn(
                  "rounded-xl border border-border/70 bg-card/50 p-4 space-y-3 text-left transition-colors",
                  canEditTemplates && "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{row.username}</p>
                    <Badge variant="secondary" className="mt-1 font-normal">
                      {t("shiftChecklistWorkspace.role")}: {formatStaffRole(row.role, t)}
                    </Badge>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>
                      {t("shiftChecklistWorkspace.updated")}:{" "}
                      {row.updated_at ? formatRelativeTime(row.updated_at) : t("shiftChecklistWorkspace.never")}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("shiftChecklistWorkspace.progress")}</span>
                    <span className="tabular-nums font-medium text-foreground">{row.percent_complete}%</span>
                  </div>
                  <Progress value={row.percent_complete} className="h-2" />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canEditTemplates ? (
        <HeadNurseStaffMemberSheet
          open={sheetRow != null}
          onOpenChange={(open) => {
            if (!open) setSheetRow(null);
          }}
          caregiver={caregiverForSheet}
          linkedUser={linkedUserForSheet}
          tasksForUser={[]}
          schedulesForUser={[]}
        />
      ) : null}
    </div>
  );
}
