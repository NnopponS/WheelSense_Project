import { API_BASE } from "@/lib/constants";

/** Browser URL for downloading/opening a workflow message attachment (cookie auth). */
export function workflowMessageAttachmentUrl(messageId: number, attachmentId: string): string {
  return `${API_BASE}/workflow/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export function canDeleteWorkflowMessage(
  me: { id: number; role: string } | null | undefined,
  msg: { sender_user_id: number; recipient_user_id: number | null },
): boolean {
  if (!me) return false;
  if (me.role === "admin" || me.role === "head_nurse") return true;
  if (msg.sender_user_id === me.id) return true;
  if (msg.recipient_user_id != null && msg.recipient_user_id === me.id) return true;
  return false;
}

export const WORKFLOW_MESSAGE_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const WORKFLOW_MESSAGE_MAX_ATTACHMENTS = 5;
