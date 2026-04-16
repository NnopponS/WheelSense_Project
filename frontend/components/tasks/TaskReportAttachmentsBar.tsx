"use client";

import { useRef, useState } from "react";
import { Paperclip, Loader2, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  taskPendingAttachmentContentUrl,
  taskTemplateAttachmentContentUrl,
} from "@/lib/api/tasks";
import { ReportAttachmentPreviewDialog } from "./ReportAttachmentPreviewDialog";

export interface PendingAttachmentItem {
  pendingId: string;
  filename: string;
  contentType: string;
}

export interface TaskReportAttachmentsBarProps {
  /** Pending uploads (create flow) */
  pendingItems: PendingAttachmentItem[];
  onPendingItemsChange: (next: PendingAttachmentItem[]) => void;
  /** After task exists — read-only chips with server attachment ids */
  taskId?: number;
  serverAttachments?: Array<{
    id: string;
    filename: string;
    content_type?: string;
  }>;
  disabled?: boolean;
  /** Hide upload control; show chips only (e.g. read-only template preview). */
  readOnly?: boolean;
  className?: string;
}

export function TaskReportAttachmentsBar({
  pendingItems,
  onPendingItemsChange,
  taskId,
  serverAttachments,
  disabled,
  readOnly,
  className,
}: TaskReportAttachmentsBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    imageSrc?: string | null;
    iframeSrc?: string | null;
    contentType?: string | null;
  } | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    setUploading(true);
    try {
      const next = [...pendingItems];
      for (const file of Array.from(files)) {
        const meta = await api.uploadWorkflowMessageAttachment(file);
        next.push({
          pendingId: meta.pending_id,
          filename: meta.filename,
          contentType: meta.content_type,
        });
      }
      onPendingItemsChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePending = (pendingId: string) => {
    onPendingItemsChange(pendingItems.filter((p) => p.pendingId !== pendingId));
  };

  const openPendingPreview = (p: PendingAttachmentItem) => {
    const url = taskPendingAttachmentContentUrl(p.pendingId);
    const isImg = p.contentType.startsWith("image/");
    setPreview({
      title: p.filename,
      imageSrc: isImg ? url : null,
      iframeSrc: !isImg ? url : null,
      contentType: p.contentType,
    });
  };

  const openServerPreview = (id: string, filename: string, ctype?: string) => {
    if (!taskId) return;
    const url = taskTemplateAttachmentContentUrl(taskId, id);
    const isImg = Boolean(ctype?.startsWith("image/"));
    setPreview({
      title: filename,
      imageSrc: isImg ? url : null,
      iframeSrc: !isImg ? url : null,
      contentType: ctype ?? null,
    });
  };

  const list = serverAttachments?.length
    ? serverAttachments.map((a) => ({
        key: `s-${a.id}`,
        label: a.filename,
        onPreview: () => openServerPreview(a.id, a.filename, a.content_type),
        onRemove: undefined as (() => void) | undefined,
      }))
    : pendingItems.map((p) => ({
        key: `p-${p.pendingId}`,
        label: p.filename,
        onPreview: () => openPendingPreview(p),
        onRemove: () => removePending(p.pendingId),
      }));

  return (
    <div className={cn("space-y-2", className)}>
      {!readOnly ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg h-8 gap-1.5"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">PDF / Image</span>
          </Button>
        ) : null}
        {list.map((item) => (
          <div
            key={item.key}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs max-w-[220px]"
          >
            <button
              type="button"
              className="truncate text-left hover:underline min-w-0 flex-1"
              onClick={item.onPreview}
              title={item.label}
            >
              {item.label}
            </button>
            <button
              type="button"
              className="shrink-0 p-0.5 rounded hover:bg-muted"
              onClick={item.onPreview}
              aria-label="Preview"
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {item.onRemove ? (
              <button
                type="button"
                className="shrink-0 p-0.5 rounded hover:bg-destructive/15"
                onClick={item.onRemove}
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <ReportAttachmentPreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview?.title ?? ""}
        imageSrc={preview?.imageSrc}
        iframeSrc={preview?.iframeSrc}
        contentType={preview?.contentType}
      />
    </div>
  );
}
