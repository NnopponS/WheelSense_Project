/**
 * Build the deep-link URL for opening a specific alert or the alerts inbox
 * inside the WebView, scoped by role.
 */

import type { UserRole } from '../types';

/**
 * Maps a role to its WebView landing path for the alerts inbox.
 */
export function alertsInboxUrl(
  role: UserRole,
  alertId?: number,
): string {
  const rolePath: Record<UserRole, string> = {
    admin: '/admin/monitoring',
    head_nurse: '/head-nurse/alerts',
    supervisor: '/supervisor/monitoring',
    observer: '/observer/alerts',
    patient: '/patient',
  };

  const base = rolePath[role] || '/observer/alerts';
  if (alertId != null) {
    // Fragment anchor so the WebView scrolls to the alert
    return `${base}#alert-${alertId}`;
  }
  return base;
}
