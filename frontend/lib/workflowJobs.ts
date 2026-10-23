import { API_BASE } from "./constants";

/** Authenticated download URL for a finalized workflow job step attachment (same-origin cookies). */
export function workflowJobStepAttachmentDownloadUrl(
  jobId: number,
  stepId: number,
  attachmentId: string,
): string {
  return `${API_BASE}/workflow/jobs/${jobId}/steps/${stepId}/attachments/${encodeURIComponent(attachmentId)}/content`;
}
