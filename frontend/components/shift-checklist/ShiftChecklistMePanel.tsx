"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  mergeServerShiftChecklist,
  rowsToApiPayload,
} from "@/lib/shiftChecklistDefaults";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function ShiftChecklistMePanel({ shiftDate }: { shiftDate: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const shiftChecklistQuery = useQuery({
    queryKey: ["shift-checklist", "me", shiftDate],
    queryFn: () => api.getShiftChecklistMe({ shift_date: shiftDate }),
  });

  const shiftChecklistMutation = useMutation({
    mutationFn: (items: ReturnType<typeof mergeServerShiftChecklist>) =>
      api.putShiftChecklistMe({ shift_date: shiftDate, items: rowsToApiPayload(items) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shift-checklist", "me", shiftDate] });
    },
  });

  const checklist = useMemo(
    () => mergeServerShiftChecklist(shiftChecklistQuery.data?.items),
    [shiftChecklistQuery.data],
  );

  const shiftStats = useMemo(() => {
    const total = checklist.length;
    const completed = checklist.filter((item) => item.checked).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [checklist]);

  const toggleChecklistItem = (id: string) => {
    const next = checklist.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    );
    shiftChecklistMutation.mutate(next);
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("observer.page.shiftChecklistTitle")}</CardTitle>
            <CardDescription>{t("observer.page.shiftChecklistDesc")}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">{shiftStats.percent}%</p>
            <p className="text-xs text-muted-foreground">{t("observer.page.completeLabel")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.shiftStart")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "shift")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {t(item.labelKey)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.roomRounds")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "room")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {t(item.labelKey)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.documentation")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "patient")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {t(item.labelKey)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
