"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Siren,
  UserCheck,
  Users,
  ArrowRight,
  Bell,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { CareTaskOut, ListAlertsResponse, ListPatientsResponse, CareDirectiveOut } from "@/lib/api/task-scope-types";
import { formatRelativeTime } from "@/lib/datetime";

type QueueItemType = "alert" | "task" | "directive";

type QueueItemStatus = "urgent" | "waiting" | "assigned" | "resolved";

interface QueueItem {
  id: number;
  type: QueueItemType;
  status: QueueItemStatus;
  title: string;
  subtitle?: string;
  priority: "critical" | "high" | "normal" | "low";
  patientId?: number | null;
  patientName?: string;
  timestamp?: string;
  actions: QueueAction[];
}

interface QueueAction {
  key: string;
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary" | "ghost";
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

interface SupervisorQueueProps {
  alerts: ListAlertsResponse;
  tasks: CareTaskOut[];
  directives: CareDirectiveOut[];
  patients: ListPatientsResponse;
  currentUserId: number | null;
  onItemAction?: (action: string, item: QueueItem) => void;
}

export function SupervisorQueue({
  alerts,
  tasks,
  directives,
  patients,
  currentUserId,
}: SupervisorQueueProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const patientById = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients]
  );

  // Mutations
  const acknowledgeAlertMutation = useMutation({
    mutationFn: (alertId: number) => api.acknowledgeAlert(alertId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "alerts"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const acceptTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      api.updateWorkflowTask(taskId, {
        status: "in_progress",
        ...(currentUserId != null ? { assigned_user_id: currentUserId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "tasks"] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.updateWorkflowTask(taskId, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const acknowledgeDirectiveMutation = useMutation({
    mutationFn: (directiveId: number) =>
      api.acknowledgeWorkflowDirective(directiveId, { note: t("supervisor.page.ackNote") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "directives"] });
    },
  });

  // Build queue items from all sources
  const queueItems = useMemo((): QueueItem[] => {
    const items: QueueItem[] = [];

    // Active alerts → urgent or waiting
    alerts
      .filter((a) => a.status === "active")
      .forEach((alert) => {
        const patient = alert.patient_id ? patientById.get(alert.patient_id) : null;
        const isCritical = alert.severity === "critical";
        items.push({
          id: alert.id,
          type: "alert",
          status: isCritical ? "urgent" : "waiting",
          title: alert.title,
          subtitle: alert.description,
          priority: isCritical ? "critical" : "high",
          patientId: alert.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}` : undefined,
          timestamp: alert.timestamp,
          actions: [
            {
              key: "acknowledge",
              label: t("supervisor.queue.acknowledge"),
              variant: isCritical ? "destructive" : "default",
              onClick: () => acknowledgeAlertMutation.mutate(alert.id),
              disabled: acknowledgeAlertMutation.isPending,
            },
            {
              key: "view",
              label: t("supervisor.queue.view"),
              variant: "outline",
              href: `/supervisor/emergency?alert=${alert.id}`,
            },
          ],
        });
      });

    // Pending/in_progress tasks
    tasks
      .filter((t) => t.status === "pending" || t.status === "in_progress")
      .forEach((task) => {
        const patient = task.patient_id ? patientById.get(task.patient_id) : null;
        const isAssignedToMe =
          task.status === "in_progress" &&
          currentUserId != null &&
          task.assigned_user_id === currentUserId;
        const priority = ["critical", "high", "normal", "low"].includes(task.priority)
          ? (task.priority as QueueItem["priority"])
          : "normal";
        
        items.push({
          id: task.id,
          type: "task",
          status: isAssignedToMe ? "assigned" : "waiting",
          title: task.title ?? t("supervisor.queue.untitledTask"),
          subtitle: task.due_at ? formatRelativeTime(task.due_at) : undefined,
          priority,
          patientId: task.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}` : undefined,
          timestamp: task.due_at ?? undefined,
          actions: isAssignedToMe
            ? [
                {
                  key: "complete",
                  label: t("supervisor.queue.complete"),
                  variant: "default",
                  onClick: () => completeTaskMutation.mutate(task.id),
                  disabled: completeTaskMutation.isPending,
                },
              ]
            : task.status === "in_progress"
              ? [
                  {
                    key: "view",
                    label: t("supervisor.queue.view"),
                    variant: "outline",
                    href: "/supervisor/tasks",
                  },
                ]
            : [
                {
                  key: "accept",
                  label: t("supervisor.queue.accept"),
                  variant: "default",
                  onClick: () => acceptTaskMutation.mutate(task.id),
                  disabled: acceptTaskMutation.isPending,
                },
              ],
        });
      });

    // Active directives
    directives
      .filter((d) => d.status === "active")
      .forEach((directive) => {
        const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
        items.push({
          id: directive.id,
          type: "directive",
          status: "waiting",
          title: directive.title,
          subtitle: directive.directive_text,
          priority: "high",
          patientId: directive.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}` : t("supervisor.page.unitWide"),
          timestamp: directive.created_at,
          actions: [
            {
              key: "acknowledge",
              label: t("supervisor.queue.acknowledge"),
              variant: "outline",
              onClick: () => acknowledgeDirectiveMutation.mutate(directive.id),
              disabled: acknowledgeDirectiveMutation.isPending,
            },
          ],
        });
      });

    // Sort: urgent first, then by priority, then by timestamp
    return items.sort((a, b) => {
      const statusOrder = { urgent: 0, waiting: 1, assigned: 2, resolved: 3 };
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
    });
  }, [alerts, tasks, directives, patientById, currentUserId, t, acknowledgeAlertMutation, acceptTaskMutation, completeTaskMutation, acknowledgeDirectiveMutation]);

  // Group by status
  const groupedItems = useMemo(() => {
    const urgent = queueItems.filter((i) => i.status === "urgent");
    const waiting = queueItems.filter((i) => i.status === "waiting");
    const assigned = queueItems.filter((i) => i.status === "assigned");
    return { urgent, waiting, assigned, total: queueItems.length };
  }, [queueItems]);

  const getTypeIcon = (type: QueueItemType) => {
    switch (type) {
      case "alert":
        return Bell;
      case "task":
        return ClipboardList;
      case "directive":
        return UserCheck;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <Badge variant="destructive">{t("priority.critical")}</Badge>;
      case "high":
        return <Badge variant="warning">{t("priority.high")}</Badge>;
      case "normal":
        return <Badge variant="secondary">{t("priority.normal")}</Badge>;
      case "low":
        return <Badge variant="outline">{t("priority.low")}</Badge>;
      default:
        return null;
    }
  };

  const renderQueueSection = (title: string, items: QueueItem[], emptyMessage: string, icon: React.ElementType) => {
    if (items.length === 0) return null;
    
    const Icon = icon;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{title}</span>
          <Badge variant="outline" className="ml-auto">{items.length}</Badge>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const TypeIcon = getTypeIcon(item.type);
            return (
              <Card key={`${item.type}-${item.id}`} className="border-border/70">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <TypeIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="font-medium text-foreground">{item.title}</p>
                        {getPriorityBadge(item.priority)}
                      </div>
                      {item.subtitle && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{item.subtitle}</p>
                      )}
                      {item.patientName && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{item.patientName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.actions.map((action) =>
                      action.href ? (
                        <Button
                          key={action.key}
                          size="sm"
                          variant={action.variant}
                          asChild
                          className="h-8"
                        >
                          <Link href={action.href}>
                            {action.label}
                            {action.key === "view" && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          key={action.key}
                          size="sm"
                          variant={action.variant}
                          onClick={action.onClick}
                          disabled={action.disabled}
                          className="h-8"
                        >
                          {action.key === "complete" && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          {action.key === "acknowledge" && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          {action.key === "accept" && <UserCheck className="mr-1 h-3.5 w-3.5" />}
                          {action.label}
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  if (queueItems.length === 0) {
    return (
      <Card className="border-border/70">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {t("supervisor.queue.allClear")}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {t("supervisor.queue.noItemsDesc")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Summary */}
      <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className={groupedItems.urgent.length > 0 ? "h-full border-red-500/35 bg-red-500/10" : "h-full"}>
          <CardContent className="flex h-full items-center p-3">
            <div className="flex items-center gap-2">
              <Siren className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground">{t("supervisor.queue.urgent")}</p>
                <p className="text-lg font-semibold tabular-nums">{groupedItems.urgent.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex h-full items-center p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">{t("supervisor.queue.waiting")}</p>
                <p className="text-lg font-semibold tabular-nums">{groupedItems.waiting.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex h-full items-center p-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-sky-600" />
              <div>
                <p className="text-xs text-muted-foreground">{t("supervisor.queue.assignedToMe")}</p>
                <p className="text-lg font-semibold tabular-nums">{groupedItems.assigned.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Sections */}
      <div className="space-y-6">
        {renderQueueSection(
          t("supervisor.queue.urgentSection"),
          groupedItems.urgent,
          t("supervisor.queue.noUrgent"),
          AlertTriangle
        )}
        {renderQueueSection(
          t("supervisor.queue.waitingSection"),
          groupedItems.waiting,
          t("supervisor.queue.noWaiting"),
          Clock
        )}
        {renderQueueSection(
          t("supervisor.queue.assignedSection"),
          groupedItems.assigned,
          t("supervisor.queue.noAssigned"),
          UserCheck
        )}
      </div>
    </div>
  );
}

export default SupervisorQueue;
