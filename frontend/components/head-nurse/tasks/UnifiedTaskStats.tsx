"use client";

import { useMemo } from "react";
import type { TaskOut } from "@/types/tasks";
import { useTranslation } from "@/lib/i18n";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from "recharts";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, Clock, AlertCircle, Users, BarChart3, PieChartIcon, 
  TrendingUp, ListTodo, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedTaskStatsProps {
  tasks: TaskOut[];
  isLoading: boolean;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const STATUS_COLORS: Record<string, string> = {
  pending: "#e2e8f0",      // Slate 200
  in_progress: "#3b82f6",  // Blue 500
  completed: "#10b981",    // Emerald 500
  skipped: "#f59e0b",      // Amber 500
  cancelled: "#ef4444",    // Red 500
};

export function UnifiedTaskStats({ tasks, isLoading }: UnifiedTaskStatsProps) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    if (!tasks.length) return null;

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const inProgress = tasks.filter(t => t.status === "in_progress").length;
    const pending = tasks.filter(t => t.status === "pending").length;
    const overdue = tasks.filter(t => {
      if (!t.due_at) return false;
      return new Date(t.due_at) < new Date() && t.status !== "completed" && t.status !== "cancelled";
    }).length;

    // Status Data for Pie Chart
    const statusData = Object.entries(
      tasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ 
      name: t(`workflowTasks.kanban.column${name.charAt(0).toUpperCase() + name.slice(1)}` as any) || name, 
      value,
      status: name
    }));

    // Workload Data (Tasks per Staff)
    const staffWorkload = Object.entries(
      tasks.reduce((acc, task) => {
        const name = task.assigned_user_name || "Unassigned";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8); // Top 8 staff

    // Priority Data
    const priorityData = ["low", "normal", "high", "critical"].map(priority => ({
      name: t(`priority.${priority}` as any),
      count: tasks.filter(t => t.priority === priority).length,
      priority
    }));

    // Task Type Data
    const typeData = [
      { name: t("tasks.specific"), count: tasks.filter(t => t.task_type === "specific").length },
      { name: t("tasks.routine"), count: tasks.filter(t => t.task_type === "routine").length },
    ];

    const completionRate = Math.round((completed / total) * 100);

    return {
      total,
      completed,
      inProgress,
      pending,
      overdue,
      completionRate,
      statusData,
      staffWorkload,
      priorityData,
      typeData
    };
  }, [tasks, t]);

  if (isLoading) {
    return <div className="p-8 text-center">{t("headNurse.statsLoading")}</div>;
  }

  if (!stats) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">{t("headNurse.statsNoTasks")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary">
              <TrendingUp className="h-4 w-4" />
              {t("tasks.completion")}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.completionRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full bg-primary/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {t("tasks.completed")}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.completed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Out of {stats.total} total tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-500" />
              {t("tasks.inProgress")}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.inProgress}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{stats.pending} tasks still pending</p>
          </CardContent>
        </Card>

        <Card className={cn(stats.overdue > 0 && "bg-red-500/5 border-red-200")}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertCircle className={cn("h-4 w-4", stats.overdue > 0 ? "text-red-500" : "text-emerald-500")} />
              {t("tasks.overdue")}
            </CardDescription>
            <CardTitle className={cn("text-3xl font-bold", stats.overdue > 0 && "text-red-500")}>
              {stats.overdue}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{t("headNurse.statsOverdue")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Task Status Distribution
            </CardTitle>
            <CardDescription>{t("headNurse.statsByStatus")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Workload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Staff Workload
            </CardTitle>
            <CardDescription>{t("headNurse.statsByStaff")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.staffWorkload} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={100} 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Bar 
                  dataKey="count" 
                  fill="#3b82f6" 
                  radius={[0, 4, 4, 0]} 
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Priority Distribution
            </CardTitle>
            <CardDescription>{t("headNurse.statsByPriority")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.priorityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.priorityData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        entry.priority === 'critical' ? '#ef4444' : 
                        entry.priority === 'high' ? '#f59e0b' : 
                        entry.priority === 'normal' ? '#3b82f6' : '#94a3b8'
                      } 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Task Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              Task Types
            </CardTitle>
            <CardDescription>{t("headNurse.statsByType")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 pt-4">
              {stats.typeData.map((type, index) => (
                <div key={type.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {index === 0 ? <ListTodo className="h-5 w-5 text-blue-500" /> : <RefreshCw className="h-5 w-5 text-emerald-500" />}
                      <span className="font-medium">{type.name}</span>
                    </div>
                    <span className="text-muted-foreground">{type.count} tasks ({Math.round(type.count / stats.total * 100)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full", index === 0 ? "bg-blue-500" : "bg-emerald-500")} 
                      style={{ width: `${type.count / stats.total * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
