"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, X, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitTaskReport } from "@/hooks/useTasks";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Validation Schema ────────────────────────────────────────────────────────

const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const reportSchema = z.object({
  description: z.string().min(1, "Description is required").max(5000),
});

type ReportFormValues = z.infer<typeof reportSchema>;

// ── Component Props ──────────────────────────────────────────────────────────

export interface ReportSubmitDialogProps {
  taskId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Helper: Format file size ──────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// ── Helper: Get file icon ────────────────────────────────────────────────────

function getFileIcon(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return "📄";
  } else if ([".jpg", ".jpeg", ".png"].some((ext) => fileName.toLowerCase().endsWith(ext))) {
    return "🖼️";
  }
  return "📎";
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReportSubmitDialog({
  taskId,
  open,
  onOpenChange,
}: ReportSubmitDialogProps) {
  const { t } = useTranslation();
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      description: "",
    },
  });

  const { mutate: submitReport, isPending } = useSubmitTaskReport(taskId);

  // ── File Validation ──────────────────────────────────────────────────────

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        const hasValidExtension = ALLOWED_FILE_EXTENSIONS.some((ext) =>
          file.name.toLowerCase().endsWith(ext)
        );
        if (!hasValidExtension) {
          return t("tasks.invalidFileType");
        }
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return t("tasks.fileTooLarge");
      }

      return null;
    },
    [t]
  );

  // ── File Handling ────────────────────────────────────────────────────────

  const handleFileSelection = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      const newFiles = Array.from(files);
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of newFiles) {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          // Prevent duplicates
          if (!attachedFiles.some((f) => f.name === file.name && f.size === file.size)) {
            validFiles.push(file);
          }
        }
      }

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles]);
      }

      if (errors.length > 0) {
        errors.forEach((error) => toast.error(error));
      }
    },
    [attachedFiles, validateFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFileSelection(e.dataTransfer.files);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Form Submission ──────────────────────────────────────────────────────

  const onSubmit = (data: ReportFormValues) => {
    try {
      // Convert files to attachment references (names)
      const attachmentReferences = attachedFiles.map((file) => file.name);

      submitReport(
        {
          report_data: {
            description: data.description,
          },
          notes: data.description,
          attachments: attachmentReferences,
        },
        {
          onSuccess: () => {
            toast.success(t("tasks.reportSuccess"));
            handleReset();
            onOpenChange(false);
          },
          onError: (error) => {
            toast.error(error.message || t("tasks.reportError"));
          },
        }
      );
    } catch (error) {
      toast.error(t("tasks.reportError"));
    }
  };

  const handleReset = () => {
    form.reset();
    setAttachedFiles([]);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleReset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 py-5">
          <DialogTitle>{t("tasks.submitReport")}</DialogTitle>
          <DialogDescription>
            {t("tasks.reportDescriptionPlaceholder")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="overflow-y-auto px-6 pb-6"
          style={{ maxHeight: "calc(90vh - 180px)" }}
        >
          <div className="space-y-6">
            {/* Description Textarea */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("tasks.reportDescription")} *
              </Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder={t("tasks.reportDescriptionPlaceholder")}
                rows={5}
                maxLength={5000}
                className="resize-none rounded-xl"
              />
              <div className="flex items-center justify-between">
                {form.formState.errors.description && (
                  <p className="text-xs text-red-500">
                    {form.formState.errors.description.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {form.watch("description")?.length || 0}/5000
                </p>
              </div>
            </div>

            {/* File Attachment Zone */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Upload className="h-4 w-4" />
                </div>
                <Label className="text-sm font-medium">{t("tasks.attachFiles")}</Label>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/50"
                )}
              >
                <input
                  type="file"
                  multiple
                  accept={ALLOWED_FILE_EXTENSIONS.join(",")}
                  onChange={(e) => handleFileSelection(e.target.files)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <div className="flex flex-col items-center gap-2 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {t("tasks.attachFilesPlaceholder")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("tasks.attachmentTypes")}
                  </p>
                </div>
              </div>

              {/* Attached Files List */}
              {attachedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {attachedFiles.length}{" "}
                    {attachedFiles.length === 1 ? "file" : "files"} attached
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5"
                      >
                        <span className="text-sm">
                          {getFileIcon(file.name)}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium line-clamp-1 max-w-[150px]">
                            {file.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(index)}
                          className="ml-1 hover:text-destructive"
                          title={t("tasks.removeFile")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="flex gap-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {t("tasks.attachmentTypes")}
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleReset();
              onOpenChange(false);
            }}
            className="rounded-xl"
          >
            {t("tasks.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isPending || !form.watch("description")}
            onClick={form.handleSubmit(onSubmit)}
            className="rounded-xl"
          >
            {isPending ? t("tasks.creating") : t("tasks.submitReport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
