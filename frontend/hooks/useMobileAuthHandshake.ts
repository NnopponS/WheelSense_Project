"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __WHEELSENSE_MOBILE__?: boolean;
    __WHEELSENSE_AUTH_TOKEN__?: string;
  }
}

/**
 * useMobileAuthHandshake
 *
 * Runs once on the client when the page is loaded inside the WheelSense
 * mobile app WebView.  The React Native side injects two globals:
 *
 *   window.__WHEELSENSE_MOBILE__ = true
 *   window.__WHEELSENSE_AUTH_TOKEN__ = '<jwt>'
 *
 * This hook calls POST /api/mobile/set-session with the token, which
 * stores it in the HttpOnly ws_token cookie so all subsequent proxied
 * API requests are authenticated automatically — the user never sees the
 * login form inside the WebView.
 *
 * @param onSuccess  Optional callback invoked after the session cookie is
 *                   set.  Typically used to trigger a refreshUser() call.
 */
export function useMobileAuthHandshake(onSuccess?: () => void) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;

    if (
      typeof window === "undefined" ||
      !window.__WHEELSENSE_MOBILE__ ||
      !window.__WHEELSENSE_AUTH_TOKEN__
    ) {
      return;
    }

    ran.current = true;
    const token = window.__WHEELSENSE_AUTH_TOKEN__;

    void (async () => {
      try {
        const res = await fetch("/api/mobile/set-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          onSuccess?.();
        } else {
          console.warn("[MobileAuth] set-session failed:", res.status);
        }
      } catch (err) {
        console.warn("[MobileAuth] set-session error:", err);
      }
    })();
  }, [onSuccess]);
}
