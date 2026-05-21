"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bug } from "lucide-react";

type CreatedTicket = {
  id: number;
  title: string;
};

type ReportIssueFormValues = {
  title: string;
  description: string;
  category: "bug" | "general" | "device";
  priority: "low" | "normal" | "high" | "critical";
};

export default function ReportIssueForm({ audience = "staff" }: { audience?: "staff" | "patient" }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const patientMode = audience === "patient";
  const copy = (staffKey: string, patientKey: string) => t(patientMode ? patientKey : staffKey);

  const endpoint = withWorkspaceScope("/support/tickets", user?.workspace_id);

  const reportIssueSchema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(3, t("support.titleMin")),
        description: z.string(),
        category: z.enum(["bug", "general", "device"]),
        priority: z.enum(["low", "normal", "high", "critical"]),
      }),
    [t],
  );

  const form = useForm<ReportIssueFormValues>({
    resolver: zodResolver(reportIssueSchema),
    defaultValues: {
      title: "",
      description: "",
      category: patientMode ? "general" : "bug",
      priority: "normal",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!endpoint) return;
    setSubmitError(null);
    try {
      const ticket = await api.post<CreatedTicket>(endpoint, {
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category,
        priority: values.priority,
        is_admin_self_ticket: false,
      });
      setCreated(ticket);
      form.reset({
        title: "",
        description: "",
        category: patientMode ? "general" : "bug",
        priority: "normal",
      });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("support.reportError"));
    }
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Bug className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {copy("support.reportTitle", "support.patientReportTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy("support.reportSubtitle", "support.patientReportSubtitle")}
          </p>
        </div>
      </div>

      {created ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {copy("support.reportSuccessTitle", "support.patientReportSuccessTitle")}
            </CardTitle>
            <CardDescription>
              {copy("support.reportSuccessBody", "support.patientReportSuccessBody").replace(
                "{id}",
                String(created.id),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {copy("support.reportAdminQueue", "support.patientReportQueue")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{copy("support.reportFormTitle", "support.patientReportFormTitle")}</CardTitle>
            <CardDescription>
              {copy("support.reportFormHint", "support.patientReportFormHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="issue-title">
                  {copy("support.fieldTitle", "support.patientFieldTitle")}
                </Label>
                <Input
                  id="issue-title"
                  placeholder={copy("support.fieldTitlePh", "support.patientFieldTitlePh")}
                  disabled={form.formState.isSubmitting}
                  {...form.register("title")}
                />
                {form.formState.errors.title ? (
                  <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-desc">
                  {copy("support.fieldDescription", "support.patientFieldDescription")}
                </Label>
                <Textarea
                  id="issue-desc"
                  rows={6}
                  placeholder={copy(
                    "support.fieldDescriptionPh",
                    "support.patientFieldDescriptionPh",
                  )}
                  disabled={form.formState.isSubmitting}
                  {...form.register("description")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("support.fieldCategory")}</Label>
                  <Controller
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bug">
                            {copy("support.categoryBug", "support.patientCategoryCorrection")}
                          </SelectItem>
                          <SelectItem value="general">
                            {copy("support.categoryGeneral", "support.patientCategoryCare")}
                          </SelectItem>
                          <SelectItem value="device">
                            {copy("support.categoryDevice", "support.patientCategoryDevice")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("support.fieldPriority")}</Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t("support.priorityLow")}</SelectItem>
                          <SelectItem value="normal">{t("support.priorityNormal")}</SelectItem>
                          <SelectItem value="high">{t("support.priorityHigh")}</SelectItem>
                          <SelectItem value="critical">{t("support.priorityCritical")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
              <Button type="submit" disabled={form.formState.isSubmitting || !endpoint}>
                {form.formState.isSubmitting
                  ? t("common.loading")
                  : copy("support.reportSubmit", "support.patientReportSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
