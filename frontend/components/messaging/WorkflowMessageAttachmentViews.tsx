"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoleMessageAttachmentOut } from "@/lib/api/task-scope-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  WORKFLOW_MESSAGE_MAX_ATTACHMENT_BYTES,
  WORKFLOW_MESSAGE_MAX_ATTACHMENTS,
  workflowMessageAttachmentUrl,
} from "@/lib/workflowMessaging";

export type PendingAttachmentChip = { pendingId: string; filename: string };

type ComposeProps = {
  idPrefix: string;
  items: PendingAttachmentChip[];
  onAdd: (file: File) => Promise<void>;
  onRemove: (pendingId: string) => void;
  disabled?: boolean;
  busy?: boolean;
};

export function WorkflowComposeAttachments({
  idPrefix,
  items,
  onAdd,
  onRemove,
  disabled,
  busy,
}: ComposeProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = `${idPrefix}-attach`;
  const pickDisabled = disabled || busy || items.length >= WORKFLOW_MESSAGE_MAX_ATTACHMENTS;

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("messaging.attachments.label")}</p>
          <p id={`${fileInputId}-hint`} className="text-xs text-muted-foreground">
            {t("messaging.attachments.hint")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 gap-2 self-start"
          disabled={pickDisabled}
          onClick={() => fileInputRef.current?.click()}
          aria-describedby={`${fileInputId}-hint`}
        >
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          {t("messaging.attachments.chooseFile")}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.webp"
        disabled={pickDisabled}
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > WORKFLOW_MESSAGE_MAX_ATTACHMENT_BYTES) {
            window.alert(t("messaging.attachments.maxSize"));
            return;
          }
          await onAdd(file);
        }}
      />
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.pendingId}>
              <Badge variant="secondary" className="gap-1.5 py-1 pr-1 font-normal">
                <Paperclip className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                <span className="max-w-[200px] truncate">{item.filename}</span>
                <button
                  type="button"
                  className="rounded-md p-0.5 hover:bg-muted"
                  onClick={() => onRemove(item.pendingId)}
                  disabled={disabled || busy}
                  aria-label={t("messaging.attachments.remove")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type ReadonlyProps = {
  messageId: number;
  attachments: RoleMessageAttachmentOut[];
  linkLabelKey?: TranslationKey;
};

export function WorkflowMessageAttachmentLinks({ messageId, attachments, linkLabelKey }: ReadonlyProps) {
  const { t } = useTranslation();
  const labelKey = linkLabelKey ?? "messaging.attachments.openFile";

  if (!attachments?.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t("messaging.attachments.sentFiles")}</p>
      <ul className="flex flex-col gap-1.5">
        {attachments.map((a) => (
          <li key={a.id}>
            <a
              href={workflowMessageAttachmentUrl(messageId, a.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              {a.filename}
              <span className="sr-only">{t(labelKey)}</span>
            </a>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              ({Math.round(a.byte_size / 1024)} KB)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
