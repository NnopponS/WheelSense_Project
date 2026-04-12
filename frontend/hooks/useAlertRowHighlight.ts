"use client";

import { useEffect, useState } from "react";

/**
 * When `alertId` and `ready` are set, scrolls to `#ws-alert-{id}` and returns that id
 * for a few seconds so callers can flash row styling.
 */
export function useAlertRowHighlight(alertId: number | null, ready: boolean) {
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (alertId == null || !ready) return;

    const scrollTimer = window.setTimeout(() => {
      setFlashId(alertId);
      requestAnimationFrame(() => {
        document.getElementById(`ws-alert-${alertId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }, 100);

    const clearFlash = window.setTimeout(() => setFlashId(null), 4200);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearFlash);
    };
  }, [alertId, ready]);

  return flashId;
}
