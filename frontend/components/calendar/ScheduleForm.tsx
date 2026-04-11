"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addHours } from "date-fns";
import { Calendar, User, MapPin, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  ListPatientsResponse,
  ListRoomsResponse,
  ListCaregiversResponse,
  CareScheduleOut,
} from "@/lib/api/task-scope-types";

const scheduleTypes = [
  { value: "medication", label: "Medication" },
  { value: "therapy", label: "Therapy" },
  { value: "checkup", label: "Check-up" },
  { value: "meal", label: "Meal" },
  { value: "activity", label: "Activity" },
  { value: "care", label: "Personal Care" },
  { value: "visit", label: "Visit" },
  { value: "other", label: "Other" },
] as const;

const recurrenceOptions = [
  { value: "", label: "None (One-time)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const scheduleFormSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200, "Title too long"),
    scheduleType: z.string().min(1, "Schedule type is required"),
    patientId: z.number().nullable().optional(),
    roomId: z.number().nullable().optional(),
    assigneeId: z.number().nullable().optional(),
    startDate: z.string().min(1, "Start date is required"),
    startTime: z.string().min(1, "Start time is required"),
    endDate: z.string().min(1, "End date is required"),
    endTime: z.string().min(1, "End time is required"),
    recurrence: z.string().optional(),
    notes: z.string().max(1000, "Notes too long").optional(),
  })
  .refine(
    (data) => {
      const start = new Date(`${data.startDate}T${data.startTime}`);
      const end = new Date(`${data.endDate}T${data.endTime}`);
      return end > start;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

interface ScheduleFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: Date;
  schedule?: CareScheduleOut | null;
  mode?: "create" | "edit";
  /** When creating, pre-select this workspace user as assignee (e.g. staff detail calendar). */
  defaultAssigneeUserId?: number | null;
}

const EMPTY_SELECT_VALUE = "__empty__";

export function ScheduleForm({
  open,
  onClose,
  onSuccess,
  initialDate,
  schedule,
  mode = "create",
  defaultAssigneeUserId = null,
}: ScheduleFormProps) {
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["shared", "calendar", "schedule-form", "patients"],
    queryFn: () => api.get<ListPatientsResponse>("/patients"),
    staleTime: getQueryStaleTimeMs("/patients"),
    refetchInterval: getQueryPollingMs("/patients"),
    retry: 3,
  });
  const { data: roomsData } = useQuery({
    queryKey: ["shared", "calendar", "schedule-form", "rooms"],
    queryFn: () => api.get<ListRoomsResponse>("/rooms"),
    staleTime: getQueryStaleTimeMs("/rooms"),
    refetchInterval: getQueryPollingMs("/rooms"),
    retry: 3,
  });
  const { data: caregiversData } = useQuery({
    queryKey: ["shared", "calendar", "schedule-form", "caregivers"],
    queryFn: () => api.get<ListCaregiversResponse>("/caregivers"),
    staleTime: getQueryStaleTimeMs("/caregivers"),
    refetchInterval: getQueryPollingMs("/caregivers"),
    retry: 3,
  });

  const patients = patientsData ?? [];
  const rooms = roomsData ?? [];
  const caregivers = caregiversData ?? [];

  const defaultValues = useMemo((): ScheduleFormValues => {
    if (schedule && mode === "edit") {
      const start = new Date(schedule.starts_at);
      const end = schedule.ends_at ? new Date(schedule.ends_at) : new Date(new Date(schedule.starts_at).getTime() + 60 * 60 * 1000);
      return {
        title: schedule.title,
        scheduleType: schedule.schedule_type || "other",
        patientId: schedule.patient_id ?? null,
        roomId: schedule.room_id ?? null,
        assigneeId: schedule.assigned_user_id ?? null,
        startDate: format(start, "yyyy-MM-dd"),
        startTime: format(start, "HH:mm"),
        endDate: format(end, "yyyy-MM-dd"),
        endTime: format(end, "HH:mm"),
        recurrence: schedule.recurrence_rule || "",
        notes: schedule.notes || "",
      };
    }

    const start = initialDate ? new Date(initialDate) : new Date();
    const end = addHours(start, 1);

    return {
      title: "",
      scheduleType: "",
      patientId: null,
      roomId: null,
      assigneeId: defaultAssigneeUserId ?? null,
      startDate: format(start, "yyyy-MM-dd"),
      startTime: format(start, "HH:mm"),
      endDate: format(end, "yyyy-MM-dd"),
      endTime: format(end, "HH:mm"),
      recurrence: "",
      notes: "",
    };
  }, [schedule, mode, initialDate, defaultAssigneeUserId]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
  });

  // Reset form when opened
  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setFormError("");
    }
  }, [open, defaultValues, reset]);

  const selectedPatientId = watch("patientId");
  const selectedRoomId = watch("roomId");

  const selectedPatient = Array.isArray(patients) ? patients.find((p) => p.id === selectedPatientId) : undefined;
  const selectedRoom = Array.isArray(rooms) ? rooms.find((r) => r.id === selectedRoomId) : undefined;

  const buildPayload = (values: ScheduleFormValues) => {
    const startTime = new Date(`${values.startDate}T${values.startTime}`).toISOString();
    const endTime = new Date(`${values.endDate}T${values.endTime}`).toISOString();

    return {
      title: values.title,
      schedule_type: values.scheduleType,
      patient_id: values.patientId,
      room_id: values.roomId,
      assigned_user_id: values.assigneeId,
      assigned_role: null,
      starts_at: startTime,
      ends_at: endTime,
      recurrence_rule: values.recurrence || "",
      notes: values.notes || "",
    };
  };

  const onSubmit = async (values: ScheduleFormValues) => {
    setFormError("");
    setIsSubmitting(true);

    try {
      const payload = buildPayload(values);

      if (mode === "edit" && schedule) {
        await api.updateWorkflowSchedule(schedule.id, payload);
      } else {
        await api.createWorkflowSchedule(payload);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save schedule"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="w-[min(100%-2rem,48rem)]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[88vh] flex-col">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit Schedule" : "Create New Schedule"}
            </DialogTitle>
            <DialogDescription>
              {mode === "edit"
                ? "Update the schedule details below."
                : "Fill in the details to create a new schedule."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto px-6 py-4">
            {/* Title and Type */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Title *" error={errors.title?.message}>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} placeholder="e.g., Morning medication" disabled={isSubmitting} />
                  )}
                />
              </FormField>

              <FormField label="Schedule Type *" error={errors.scheduleType?.message}>
                <Controller
                  name="scheduleType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || EMPTY_SELECT_VALUE}
                      onValueChange={(value) =>
                        field.onChange(value === EMPTY_SELECT_VALUE ? "" : value)
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {scheduleTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* Patient and Room */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Patient">
                <Controller
                  name="patientId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value?.toString() || EMPTY_SELECT_VALUE}
                      onValueChange={(value) =>
                        field.onChange(
                          value === EMPTY_SELECT_VALUE ? null : Number(value)
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT_VALUE}>
                          <span className="text-muted-foreground">— No patient —</span>
                        </SelectItem>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id.toString()}>
                            {patient.first_name} {patient.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedPatient && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    Selected: {selectedPatient.first_name} {selectedPatient.last_name}
                  </div>
                )}
              </FormField>

              <FormField label="Room">
                <Controller
                  name="roomId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value?.toString() || EMPTY_SELECT_VALUE}
                      onValueChange={(value) =>
                        field.onChange(
                          value === EMPTY_SELECT_VALUE ? null : Number(value)
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select room..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT_VALUE}>
                          <span className="text-muted-foreground">— No room —</span>
                        </SelectItem>
                        {Array.isArray(rooms) && rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id.toString()}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedRoom && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    Selected: {selectedRoom.name}
                  </div>
                )}
              </FormField>
            </div>

            {/* Assignee */}
            <FormField label="Assigned To">
              <Controller
                name="assigneeId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value?.toString() || EMPTY_SELECT_VALUE}
                    onValueChange={(value) =>
                      field.onChange(
                        value === EMPTY_SELECT_VALUE ? null : Number(value)
                      )
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>
                        <span className="text-muted-foreground">— Unassigned —</span>
                      </SelectItem>
                      {caregivers.map((caregiver) => (
                        <SelectItem key={caregiver.id} value={caregiver.id.toString()}>
                          {caregiver.first_name} {caregiver.last_name}
                          {caregiver.role && (
                            <span className="ml-2 text-muted-foreground">
                              ({caregiver.role})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            {/* Date and Time */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Date & Time
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <FormField label="Start Date *" error={errors.startDate?.message}>
                    <Controller
                      name="startDate"
                      control={control}
                      render={({ field }) => (
                        <Input type="date" {...field} disabled={isSubmitting} />
                      )}
                    />
                  </FormField>

                  <FormField label="Start Time *" error={errors.startTime?.message}>
                    <Controller
                      name="startTime"
                      control={control}
                      render={({ field }) => (
                        <Input type="time" {...field} disabled={isSubmitting} />
                      )}
                    />
                  </FormField>
                </div>

                <div className="space-y-3">
                  <FormField label="End Date *" error={errors.endDate?.message}>
                    <Controller
                      name="endDate"
                      control={control}
                      render={({ field }) => (
                        <Input type="date" {...field} disabled={isSubmitting} />
                      )}
                    />
                  </FormField>

                  <FormField label="End Time *" error={errors.endTime?.message}>
                    <Controller
                      name="endTime"
                      control={control}
                      render={({ field }) => (
                        <Input type="time" {...field} disabled={isSubmitting} />
                      )}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            {/* Recurrence */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Recurrence">
                <Controller
                  name="recurrence"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || EMPTY_SELECT_VALUE}
                      onValueChange={(value) =>
                        field.onChange(
                          value === EMPTY_SELECT_VALUE ? "" : value
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select recurrence..." />
                      </SelectTrigger>
                      <SelectContent>
                        {recurrenceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value || EMPTY_SELECT_VALUE}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* Notes */}
            <FormField label="Notes" error={errors.notes?.message}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    placeholder="Additional notes or instructions..."
                    rows={3}
                    disabled={isSubmitting}
                  />
                )}
              />
            </FormField>

            {/* Error message */}
            {formError && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === "edit"
                  ? "Saving..."
                  : "Creating..."
                : mode === "edit"
                  ? "Save Changes"
                  : "Create Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default ScheduleForm;
