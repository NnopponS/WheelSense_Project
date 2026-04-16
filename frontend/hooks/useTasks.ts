"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as tasksApi from "@/lib/api/tasks";
import type { ApiError } from "@/lib/api";
import { calendarEventQueryKey } from "@/hooks/useCalendarEvents";
import type { TaskCreate, TaskUpdate, TaskReportCreate } from "@/types/tasks";

// ── Query Keys ────────────────────────────────────────────────────────────────

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (params: Record<string, any>) => [...taskKeys.lists(), params] as const,
  board: (shiftDate?: string) => [...taskKeys.all, "board", shiftDate] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: number) => [...taskKeys.details(), id] as const,
  reports: (taskId: number) => [...taskKeys.all, taskId, "reports"] as const,
};

// ── Query Hooks ───────────────────────────────────────────────────────────────

export function useTasks(params?: Record<string, any>) {
  return useQuery({
    queryKey: taskKeys.list(params ?? {}),
    queryFn: () => tasksApi.fetchTasks(params),
  });
}

export function useTaskBoard(shiftDate?: string) {
  return useQuery({
    queryKey: taskKeys.board(shiftDate),
    queryFn: () => tasksApi.fetchTaskBoard(shiftDate),
  });
}

export function useTask(taskId: number) {
  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => tasksApi.fetchTask(taskId),
    enabled: taskId > 0,
  });
}

export function useTaskReports(taskId: number) {
  return useQuery({
    queryKey: taskKeys.reports(taskId),
    queryFn: () => tasksApi.fetchTaskReports(taskId),
    enabled: taskId > 0,
  });
}

// ── Mutation Hooks ────────────────────────────────────────────────────────────

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaskCreate) => tasksApi.createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: calendarEventQueryKey.all });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: TaskUpdate }) =>
      tasksApi.updateTask(taskId, data),
    onSuccess: (_, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: calendarEventQueryKey.all });
      toast.success("Task updated successfully");
    },
    onError: (err) => {
      const message = err instanceof Error && "status" in err 
        ? (err as ApiError).message 
        : "Failed to update task";
      toast.error(message);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: number) => tasksApi.deleteTask(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: calendarEventQueryKey.all });
      toast.success("Task deleted successfully");
    },
    onError: (err) => {
      const message = err instanceof Error && "status" in err 
        ? (err as ApiError).message 
        : "Failed to delete task";
      toast.error(message);
    },
  });
}

export function useSubmitTaskReport(taskId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaskReportCreate) => tasksApi.submitTaskReport(taskId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.reports(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success("Report submitted successfully");
    },
    onError: (err) => {
      const message = err instanceof Error && "status" in err 
        ? (err as ApiError).message 
        : "Failed to submit report";
      toast.error(message);
    },
  });
}

export function useResetRoutineTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shiftDate?: string) => tasksApi.resetRoutineTasks(shiftDate),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: calendarEventQueryKey.all });
      toast.success(`Reset ${data.reset_count} routine tasks`);
    },
    onError: (err) => {
      const message = err instanceof Error && "status" in err 
        ? (err as ApiError).message 
        : "Failed to reset routine tasks";
      toast.error(message);
    },
  });
}
