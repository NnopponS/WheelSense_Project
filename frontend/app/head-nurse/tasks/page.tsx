"use client";

import { useTranslation } from "@/lib/i18n";
import { TasksPageLayout } from "@/components/tasks/TasksPageLayout";

/**
 * Head Nurse Tasks Page
 * 
 * Head Nurses have full task management control:
 * - Create, edit, delete tasks
 * - Assign tasks to any staff member
 * - Daily routine / shift checklist overview
 * - View all tasks in their workspace
 */
export default function HeadNurseTasksPage() {
  const { t } = useTranslation();

  return (
    <TasksPageLayout
      title={t("tasks.taskManagement")}
      description={t("tasks.taskManagementDesc")}
      role="head-nurse"
      canCreate={true}
      canManage={true}
      canExecute={true}
      showDailyRoutineOverview={true}
    />
  );
}
