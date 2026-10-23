/** Shared rules for task report / template file metadata (names only; binary upload is out of scope). */

export const TASK_ATTACHMENT_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const TASK_ATTACHMENT_ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;

export const TASK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export function validateTaskAttachmentFile(file: File): string | null {
  if (!TASK_ATTACHMENT_ALLOWED_TYPES.includes(file.type as (typeof TASK_ATTACHMENT_ALLOWED_TYPES)[number])) {
    const okExt = TASK_ATTACHMENT_ALLOWED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );
    if (!okExt) {
      return "invalidFileType";
    }
  }
  if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
    return "fileTooLarge";
  }
  return null;
}

export function formatTaskFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}
