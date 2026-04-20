"use client";

import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { TasksPageLayout } from "@/components/tasks/TasksPageLayout";
import type { TaskOut } from "@/types/tasks";

/**
 * Supervisor Tasks Page
 *
 * Supervisors can:
 * - View all tasks in the workspace (read-only)
 * - Execute assigned tasks (update status, submit reports)
 * - View task details and reports
 * - Cannot create, delete, or reassign tasks
 */
export default function SupervisorTasksPage() {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const { t } = useTranslation();

  // Filter to show only tasks assigned to this supervisor or unassigned
  const filterTasks = (tasks: TaskOut[]) => {
    return tasks.filter(
      (task) => !task.assigned_user_id || task.assigned_user_id === currentUserId
    );
  };

  return (
    <TasksPageLayout
      title={t("supervisor.tasksTitle")}
      description={t("supervisor.tasksDescription")}
      role="supervisor"
      canCreate={false}
      canManage={false}
      canExecute={true}
      filterTasks={filterTasks}
      currentUserId={currentUserId}
    />
  );
}
