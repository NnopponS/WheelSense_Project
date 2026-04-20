"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ws-font-scale";
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.875;
const MAX_SCALE = 1.5;
const STEP = 0.125;

export type FontScale = number;

export interface UseFontScaleReturn {
  /** Current font scale multiplier (0.875 - 1.5) */
  scale: FontScale;
  /** Increase font size by one step (max 1.5) */
  increase: () => void;
  /** Decrease font size by one step (min 0.875) */
  decrease: () => void;
  /** Reset to default (1.0) */
  reset: () => void;
  /** Set explicit scale value (clamped to min/max) */
  setScale: (value: number) => void;
  /** CSS class name for elder-friendly sizing */
  elderClass: string;
  /** Whether current scale is above default */
  isEnlarged: boolean;
}

function clampScale(value: number): FontScale {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(value / STEP) * STEP));
}

function getStoredScale(): FontScale {
  if (typeof window === "undefined") return DEFAULT_SCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCALE;
    const parsed = parseFloat(raw);
    return clampScale(Number.isFinite(parsed) ? parsed : DEFAULT_SCALE);
  } catch {
    return DEFAULT_SCALE;
  }
}

function setStoredScale(value: FontScale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors (e.g., private mode)
  }
}

/**
 * Hook for elder-friendly font scaling.
 * Persists preference to localStorage and applies CSS variable --ws-font-scale.
 */
export function useFontScale(): UseFontScaleReturn {
  const [scale, setScaleState] = useState<FontScale>(DEFAULT_SCALE);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setScaleState(getStoredScale());
  }, []);

  // Apply CSS variable whenever scale changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--ws-font-scale", String(scale));
  }, [scale]);

  const setScale = useCallback((value: number) => {
    const clamped = clampScale(value);
    setScaleState(clamped);
    setStoredScale(clamped);
  }, []);

  const increase = useCallback(() => {
    setScale(scale + STEP);
  }, [scale, setScale]);

  const decrease = useCallback(() => {
    setScale(scale - STEP);
  }, [scale, setScale]);

  const reset = useCallback(() => {
    setScale(DEFAULT_SCALE);
  }, [setScale]);

  const elderClass = scale > 1 ? "ws-role-elder" : "";
  const isEnlarged = scale > DEFAULT_SCALE;

  return {
    scale,
    increase,
    decrease,
    reset,
    setScale,
    elderClass,
    isEnlarged,
  };
}

export default useFontScale;
