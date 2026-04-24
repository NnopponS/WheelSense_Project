"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ReportAttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** For images */
  imageSrc?: string | null;
  /** For PDFs and other non-image previews */
  iframeSrc?: string | null;
  contentType?: string | null;
}

export function ReportAttachmentPreviewDialog({
  open,
  onOpenChange,
  title,
  imageSrc,
  iframeSrc,
  contentType,
}: ReportAttachmentPreviewDialogProps) {
  const isImage =
    Boolean(imageSrc) ||
    (contentType?.startsWith("image/") ?? false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold truncate pr-8">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {title}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[50vh] max-h-[calc(90vh-4rem)] flex-1 bg-muted/20 flex items-center justify-center overflow-auto p-2">
          {isImage && imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={title}
              className="max-w-full max-h-[calc(90vh-6rem)] object-contain rounded-lg"
            />
          ) : iframeSrc ? (
            <iframe
              title={title}
              src={iframeSrc}
              className="w-full min-h-[70vh] rounded-lg border bg-background"
            />
          ) : (
            <p className="text-sm text-muted-foreground p-8">No preview available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
