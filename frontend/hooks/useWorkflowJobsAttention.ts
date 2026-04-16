"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CareWorkflowJobOut } from "@/lib/api/task-scope-types";
import { useAuth } from "@/hooks/useAuth";

/** Same clinical roles as workflow task list / notifications workflow jobs poll. */
const WORKFLOW_JOBS_ROLES = new Set(["admin", "head_nurse", "supervisor", "observer"]);

/** Coordinators see all open jobs in the workspace poll (matches operational oversight). */
const COORDINATOR_ROLES = new Set(["admin", "head_nurse", "supervisor"]);

function openStepsRemaining(job: CareWorkflowJobOut): number {
  return (job.steps ?? []).filter((s) => s.status !== "done" && s.status !== "skipped").length;
}

function jobNeedsWorkspaceAttention(job: CareWorkflowJobOut): boolean {
  if (job.status !== "active" && job.status !== "draft") return false;
  return openStepsRemaining(job) > 0;
}

function jobNeedsMyAttention(job: CareWorkflowJobOut, userId: number): boolean {
  if (job.status !== "active" && job.status !== "draft") return false;
  if (openStepsRemaining(job) <= 0) return false;

  const jobAssignees = new Set((job.assignees ?? []).map((a) => a.user_id));
  const myOpenStep = (job.steps ?? []).some(
    (s) =>
      s.assigned_user_id === userId && s.status !== "done" && s.status !== "skipped",
  );
  if (myOpenStep) return true;
  if (jobAssignees.has(userId)) return true;

  const unassignedOpen = (job.steps ?? []).some(
    (s) =>
      (s.assigned_user_id == null || s.assigned_user_id === undefined) &&
      s.status !== "done" &&
      s.status !== "skipped",
  );
  if (jobAssignees.size === 0 && unassignedOpen) return true;

  return false;
}

/**
 * Badge count: coordinators see all active jobs with pending steps; others see jobs that involve them.
 * Shares React Query cache with `useNotifications` (`["notifications","workflow-jobs"]`).
 */
export function useWorkflowJobsAttentionCount(): number {
  const { user } = useAuth();
  const enabled = Boolean(user?.role && WORKFLOW_JOBS_ROLES.has(user.role));
  const uid = user?.id;
  const role = user?.role;

  const { data } = useQuery({
    queryKey: ["notifications", "workflow-jobs"],
    queryFn: () => api.listWorkflowJobs({ limit: 100 }),
    enabled,
  });

  return useMemo(() => {
    if (!data?.length || uid == null) return 0;
    if (role && COORDINATOR_ROLES.has(role)) {
      return data.filter(jobNeedsWorkspaceAttention).length;
    }
    return data.filter((j) => jobNeedsMyAttention(j, uid)).length;
  }, [data, uid, role]);
}
