"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronDown, Circle, FileText, Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import type { CareWorkflowJobOut, ListPatientsResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { workflowJobStepAttachmentDownloadUrl } from "@/lib/workflowJobs";
import { WorkflowJobCreateDialog } from "@/components/workflow/WorkflowJobCreateDialog";

export type WorkflowJobsPanelVariant = "head-nurse" | "observer" | "supervisor";

const JOBS_QUERY: Record<WorkflowJobsPanelVariant, readonly string[]> = {
  "head-nurse": ["head-nurse", "workflow-jobs"],
  observer: ["observer", "workflow-jobs"],
  supervisor: ["supervisor", "workflow-jobs"],
};

/** Invalidate companion `care_tasks` feeds (shadow row per checklist job) + ops console. */
function invalidateWorkflowTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  variant: WorkflowJobsPanelVariant,
) {
  const role = variant === "head-nurse" ? "head_nurse" : variant;
  void queryClient.invalidateQueries({ queryKey: [variant, "tasks"] });
  void queryClient.invalidateQueries({ queryKey: [role, "workflow", "tasks"] });
  void queryClient.invalidateQueries({ queryKey: [variant, "dashboard", "tasks"] });
}

function stepProgress(job: CareWorkflowJobOut): { done: number; total: number } {
  const steps = job.steps ?? [];
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return { done, total };
}

/** Mirrors `STAFF_WIDE_ROLES` + unassigned-step rule in `care_workflow_jobs.patch_step`. */
const COORDINATOR_ROLES = new Set(["admin", "head_nurse", "supervisor"]);

function actorMayEditStep(
  actorUserId: number | undefined,
  actorRole: string | undefined,
  stepAssignedUserId: number | null | undefined,
): boolean {
  if (actorUserId == null || actorRole == null) return false;
  if (stepAssignedUserId == null || stepAssignedUserId === undefined) return true;
  if (actorUserId === stepAssignedUserId) return true;
  return COORDINATOR_ROLES.has(actorRole);
}

export function WorkflowJobsPanel({ variant }: { variant: WorkflowJobsPanelVariant }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qk = JOBS_QUERY[variant];
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<CareWorkflowJobOut | null>(null);

  const jobsQuery = useQuery({
    queryKey: [...qk],
    queryFn: () => api.listWorkflowJobs({ limit: 200 }),
  });

  const patientsQuery = useQuery({
    queryKey: [...qk, "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const usersQuery = useQuery({
    queryKey: [...qk, "users"],
    queryFn: () => api.listUsers(),
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const users = useMemo(() => (usersQuery.data ?? []) as ListUsersResponse, [usersQuery.data]);

  const patientNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of patients) {
      m.set(p.id, `${p.first_name} ${p.last_name}`.trim());
    }
    return m;
  }, [patients]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [...qk] });
    void queryClient.invalidateQueries({ queryKey: ["notifications", "workflow-jobs"] });
    invalidateWorkflowTaskQueries(queryClient, variant);
  };

  const createMutation = useMutation({
    mutationFn: api.createWorkflowJob,
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: api.completeWorkflowJob,
    onSuccess: () => {
      invalidate();
      setDetailJob(null);
    },
  });

  const patchStepMutation = useMutation({
    mutationFn: ({
      jobId,
      stepId,
      body,
    }: {
      jobId: number;
      stepId: number;
      body: Parameters<typeof api.patchWorkflowJobStep>[2];
    }) => api.patchWorkflowJobStep(jobId, stepId, body),
    onSuccess: (_, v) => {
      invalidate();
      void jobsQuery.refetch().then((r) => {
        const list = (r.data ?? []) as CareWorkflowJobOut[];
        const j = list.find((x) => x.id === v.jobId);
        if (j) setDetailJob(j);
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t("workflowJobs.stepCompleteDenied"));
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      jobId,
      stepId,
      file,
    }: {
      jobId: number;
      stepId: number;
      file: File;
    }) => {
      const up = await api.uploadWorkflowMessageAttachment(file);
      return api.finalizeWorkflowJobStepAttachments(jobId, stepId, [up.pending_id]);
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t("workflowJobs.stepCompleteDenied"));
      }
    },
  });

  const jobs = (jobsQuery.data ?? []) as CareWorkflowJobOut[];

  // #region agent log
  useEffect(() => {
    void fetch("http://127.0.0.1:7687/ingest/3079ba95-d656-44c3-9953-dc1c569178f1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4d0de1" },
      body: JSON.stringify({
        sessionId: "4d0de1",
        runId: "run2",
        hypothesisId: "H1-H2",
        location: "WorkflowJobsPanel.tsx:jobs",
        message: "workflow jobs list result",
        data: { variant, jobsLen: jobs.length, jobsFetchStatus: jobsQuery.fetchStatus },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [jobs.length, jobsQuery.fetchStatus, variant]);
  // #endregion

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-primary/15 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {t("workflowJobs.panelTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("workflowJobs.panelSubtitle")}</p>
        </div>
        <Button type="button" size="lg" className="h-11 shrink-0 gap-2 px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("workflowJobs.createJobPrimary")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {jobsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : jobs.length === 0 ? (
          <Card className="border-dashed md:col-span-2">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="max-w-md text-sm text-muted-foreground">{t("workflowJobs.empty")}</p>
              <Button type="button" size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("workflowJobs.createJobPrimary")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => {
            const { done, total } = stepProgress(job);
            const stepsPreview = (job.steps ?? []).slice(0, 6);
            return (
              <Card
                key={job.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer border-border/80 text-left transition-colors hover:border-primary/45 hover:bg-muted/10"
                onClick={() => setDetailJob(job)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailJob(job);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base leading-snug">{job.title}</CardTitle>
                  <CardDescription>
                    {format(parseISO(job.starts_at), "yyyy-MM-dd HH:mm")}
                    {job.duration_minutes != null ? ` · ${job.duration_minutes} min` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      {t("workflowJobs.statusLabel")}: <span className="text-foreground">{job.status}</span>
                    </span>
                    <span>
                      {t("workflowJobs.progress")
                        .replace("{done}", String(done))
                        .replace("{total}", String(total))}
                    </span>
                  </div>
                  <p>
                    <span className="text-foreground/90">{t("workflowJobs.patientsShort")}: </span>
                    {job.patient_ids.length
                      ? job.patient_ids
                          .map((id) => patientNameById.get(id) ?? `#${id}`)
                          .join(", ")
                      : "—"}
                  </p>
                  {stepsPreview.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("workflowJobs.checklistOnCard")}
                      </p>
                      <ol className="mt-1.5 space-y-1 border-l-2 border-primary/25 pl-3">
                        {stepsPreview.map((s) => (
                          <li key={s.id} className="flex items-start gap-2 text-foreground/90">
                            {s.status === "done" || s.status === "skipped" ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            )}
                            <span className="line-clamp-2 leading-snug">{s.title}</span>
                          </li>
                        ))}
                      </ol>
                      {total > stepsPreview.length ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          +{total - stepsPreview.length}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <WorkflowJobCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        patients={patients}
        users={users}
        submitting={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />

      <Sheet open={detailJob != null} onOpenChange={(o) => !o && setDetailJob(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detailJob ? (
            <>
              <SheetHeader>
                <SheetTitle>{detailJob.title}</SheetTitle>
                <SheetDescription>
                  {format(parseISO(detailJob.starts_at), "yyyy-MM-dd HH:mm")}
                  {detailJob.duration_minutes != null ? ` · ${detailJob.duration_minutes} min` : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-6">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {t("workflowJobs.checklist")}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {detailJob.steps.map((step) => {
                      const mayEdit = actorMayEditStep(user?.id, user?.role, step.assigned_user_id);
                      return (
                      <li key={step.id} className="rounded-lg border border-border/70 bg-card">
                        <div className="flex gap-2 p-2 sm:p-3">
                          <button
                            type="button"
                            disabled={!mayEdit || patchStepMutation.isPending}
                            className="mt-1 shrink-0 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            aria-label={step.status === "done" ? "Mark not done" : "Mark done"}
                            onClick={(e) => {
                              e.stopPropagation();
                              patchStepMutation.mutate({
                                jobId: detailJob.id,
                                stepId: step.id,
                                body: {
                                  status: step.status === "done" ? "pending" : "done",
                                },
                              });
                            }}
                          >
                            {step.status === "done" || step.status === "skipped" ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <details className="min-w-0 flex-1 group">
                            <summary
                              className="flex cursor-pointer list-none items-start justify-between gap-2 [&::-webkit-details-marker]:hidden"
                              title={t("workflowJobs.stepDetailsHint")}
                            >
                              <span className="pt-0.5 font-medium leading-snug">{step.title}</span>
                              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="mt-2 space-y-3 border-t border-border/60 pt-3">
                              {step.instructions ? (
                                <p className="text-sm text-muted-foreground">{step.instructions}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {t("workflowJobs.stepNoExtraInstructions")}
                                </p>
                              )}
                              {!mayEdit ? (
                                <p className="text-xs text-muted-foreground">{t("workflowJobs.stepCompleteDenied")}</p>
                              ) : null}
                              <div>
                                <Label className="text-xs">{t("workflowJobs.report")}</Label>
                                <Textarea
                                  className="mt-1 min-h-[72px]"
                                  disabled={!mayEdit}
                                  value={step.report_text}
                                  onChange={(e) => {
                                    setDetailJob({
                                      ...detailJob,
                                      steps: detailJob.steps.map((s) =>
                                        s.id === step.id ? { ...s, report_text: e.target.value } : s,
                                      ),
                                    });
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="mt-2"
                                  disabled={!mayEdit || patchStepMutation.isPending}
                                  onClick={() => {
                                    const s = detailJob.steps.find((x) => x.id === step.id);
                                    if (!s) return;
                                    patchStepMutation.mutate({
                                      jobId: detailJob.id,
                                      stepId: step.id,
                                      body: { report_text: s.report_text },
                                    });
                                  }}
                                >
                                  {t("workflowJobs.saveReport")}
                                </Button>
                              </div>
                              <div>
                                <Label className="text-xs">{t("workflowJobs.attachFile")}</Label>
                                <Input
                                  type="file"
                                  className="mt-1"
                                  disabled={!mayEdit || uploadMutation.isPending}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f)
                                      uploadMutation.mutate({
                                        jobId: detailJob.id,
                                        stepId: step.id,
                                        file: f,
                                      });
                                    e.target.value = "";
                                  }}
                                />
                                {step.attachments?.length ? (
                                  <ul className="mt-2 space-y-1 text-sm">
                                    {step.attachments.map((a) => (
                                      <li key={a.id}>
                                        <a
                                          className="inline-flex items-center gap-1 text-primary underline"
                                          href={workflowJobStepAttachmentDownloadUrl(
                                            detailJob.id,
                                            step.id,
                                            a.id,
                                          )}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          {a.filename}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </div>
                          </details>
                        </div>
                      </li>
                    );
                    })}
                  </ul>
                </div>

                {detailJob.status !== "completed" ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full"
                      disabled={
                        completeMutation.isPending ||
                        detailJob.steps.some((s) => s.status !== "done" && s.status !== "skipped")
                      }
                      onClick={() => completeMutation.mutate(detailJob.id)}
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("workflowJobs.completeJob")}
                    </Button>
                    {detailJob.steps.some((s) => s.status !== "done" && s.status !== "skipped") ? (
                      <p className="text-center text-xs text-muted-foreground">
                        {t("workflowJobs.completeBlockedHint")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("workflowJobs.jobCompleted")}</p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
