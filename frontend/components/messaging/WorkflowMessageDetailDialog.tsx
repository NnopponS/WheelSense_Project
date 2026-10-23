"use client";
"use no memo";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowMessageAttachmentLinks } from "@/components/messaging/WorkflowMessageAttachmentViews";
import type { RoleMessageAttachmentOut } from "@/lib/api/task-scope-types";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type WorkflowMessageDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  body: string;
  meta?: ReactNode;
  contentClassName?: string;
  messageId?: number;
  attachments?: RoleMessageAttachmentOut[];
};

export function WorkflowMessageDetailDialog({
  open,
  onOpenChange,
  subject,
  body,
  meta,
  contentClassName,
  messageId,
  attachments,
}: WorkflowMessageDetailDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex w-[min(100%-1rem,min(96vw,88rem))] max-h-[min(96dvh,100vh)] flex-col gap-0 p-0 sm:rounded-3xl",
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pb-4 pt-6">
          <DialogTitle className="pr-10 text-left text-xl font-semibold leading-snug tracking-tight">
            {subject}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("clinical.workflowMessage.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {meta ? (
          <div className="shrink-0 border-t border-border/70 bg-muted/30 px-6 py-3 text-sm">{meta}</div>
        ) : null}
        <div className="min-h-0 max-h-[min(72dvh,720px)] flex-1 overflow-y-auto border-t border-border/70 px-6 py-5">
          {typeof messageId === "number" && attachments?.length ? (
            <div className="mb-4">
              <WorkflowMessageAttachmentLinks messageId={messageId} attachments={attachments} />
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">{body}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type WorkflowMessagePreviewTriggerProps = {
  subject: string;
  body: string;
  onOpen: () => void;
  className?: string;
};

export function WorkflowMessagePreviewTrigger({
  subject,
  body,
  onOpen,
  className,
}: WorkflowMessagePreviewTriggerProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className={cn(
        "group w-full space-y-1 rounded-xl p-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      onClick={onOpen}
      aria-label={t("clinical.workflowMessage.openFullMessage")}
    >
      <p className="font-medium text-foreground group-hover:text-foreground">{subject}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground group-hover:text-muted-foreground">{body}</p>
    </button>
  );
}
