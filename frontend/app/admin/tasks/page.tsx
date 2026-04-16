"use client";

import { useTranslation } from "@/lib/i18n";
import { TasksPageLayout } from "@/components/tasks/TasksPageLayout";

/**
 * Admin Tasks Page
 * 
 * Admins have full control over tasks:
 * - Create, edit, delete tasks
 * - Assign tasks to any user
 * - Daily routine / shift checklist overview
 * - View all tasks in the workspace
 */
export default function AdminTasksPage() {
  const { t } = useTranslation();

  return (
    <TasksPageLayout
      title={t("tasks.taskManagement")}
      description={t("tasks.taskManagementDesc")}
      role="admin"
      canCreate={true}
      canManage={true}
      canExecute={true}
      showDailyRoutineOverview={true}
    />
  );
}
