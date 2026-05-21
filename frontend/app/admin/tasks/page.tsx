"use client";

import { useTranslation } from "@/lib/i18n";
import { TasksPageLayout } from "@/components/tasks/TasksPageLayout";
import { LayoutDashboard, Settings, Tablet, Users } from "lucide-react";

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
      contextTitle="Related views"
      contextActions={[
        { label: t("nav.dashboard"), description: "System summary", href: "/admin", icon: LayoutDashboard, tone: "primary" },
        { label: t("nav.devices"), description: "Fleet health", href: "/admin/devices", icon: Tablet, tone: "warning" },
        { label: t("nav.personnel"), description: "Users and roles", href: "/admin/personnel", icon: Users, tone: "neutral" },
        { label: t("nav.settings"), description: "Platform controls", href: "/admin/settings", icon: Settings, tone: "neutral" },
      ]}
    />
  );
}
