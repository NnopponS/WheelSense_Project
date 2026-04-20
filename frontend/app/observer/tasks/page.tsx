"use client";

import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { TasksPageLayout } from "@/components/tasks/TasksPageLayout";

/**
 * Observer Tasks Page
 *
 * Observers can:
 * - View assigned tasks only (read-only)
 * - Execute tasks by updating status and submitting reports
 * - View task details and existing reports
 * - Cannot create, delete, reassign, or modify task properties
 */
export default function ObserverTasksPage() {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const { t } = useTranslation();

  return (
    <TasksPageLayout
      title={t("observer.page.statMyTasks")}
      description={t("observer.page.tasksDescription")}
      role="observer"
      canCreate={false}
      canManage={false}
      canExecute={true}
      taskParams={{ assignee_user_id: currentUserId }}
      currentUserId={currentUserId}
    />
  );
}
