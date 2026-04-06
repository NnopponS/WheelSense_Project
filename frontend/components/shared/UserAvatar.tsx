"use client";

import { useCallback, useState } from "react";

export interface UserAvatarProps {
  username: string;
  profileImageUrl?: string | null;
  sizePx?: number;
  className?: string;
  /** e.g. "bg-primary/20 text-primary" when no image */
  fallbackClassName?: string;
}

function initialsFromUsername(username: string): string {
  const t = username?.trim();
  if (!t) return "U";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return t[0]?.toUpperCase() ?? "U";
}

/**
 * Renders profile image when `profileImageUrl` is set and loads; otherwise shows initials.
 */
export default function UserAvatar({
  username,
  profileImageUrl,
  sizePx = 32,
  className = "",
  fallbackClassName = "gradient-cta text-white",
}: UserAvatarProps) {
  const normalizedProfileImageUrl = profileImageUrl?.trim() ?? "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImg =
    normalizedProfileImageUrl.length > 0 && failedSrc !== normalizedProfileImageUrl;

  const onError = useCallback(() => {
    setFailedSrc(normalizedProfileImageUrl || null);
  }, [normalizedProfileImageUrl]);

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar source may be a hosted local path or arbitrary external http(s) URL
      <img
        src={normalizedProfileImageUrl}
        alt=""
        width={sizePx}
        height={sizePx}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: sizePx, height: sizePx }}
        onError={onError}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${fallbackClassName} ${className}`}
      style={{ width: sizePx, height: sizePx, fontSize: sizePx > 36 ? 14 : 12 }}
      aria-hidden
    >
      {initialsFromUsername(username)}
    </div>
  );
}
