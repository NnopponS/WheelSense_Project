"use client";

import type { ReactElement, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ConfirmActionProps {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  affectedEntity?: ReactNode;
  icon?: ReactNode;
  tone?: "warning" | "critical";
}

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  affectedEntity,
  icon,
  tone = "warning",
}: ConfirmActionProps) {
  const critical = tone === "critical";

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div
            className={cn(
              "mb-2 flex h-14 w-14 items-center justify-center rounded-xl",
              critical
                ? "bg-critical-bg text-critical-foreground"
                : "bg-warning-bg text-warning-foreground",
            )}
            aria-hidden="true"
          >
            {icon ?? <AlertTriangle className="h-7 w-7" />}
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {affectedEntity ? (
          <div className="rounded-lg border border-border bg-surface-container-low p-3 text-sm text-foreground">
            {affectedEntity}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              critical && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
