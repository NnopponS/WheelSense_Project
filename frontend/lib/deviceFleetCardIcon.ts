import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  HeartPulse,
  HousePlug,
  Radio,
  Smartphone,
  Tablet,
} from "lucide-react";
import type { HardwareType } from "@/lib/types";

export interface DeviceCardIconPresentation {
  Icon: LucideIcon;
  /** Wrapper behind icon (Tailwind classes) */
  wrapClass: string;
  /** Icon stroke/fill color */
  iconClass: string;
}

const REGISTRY_MAP: Record<
  HardwareType,
  { Icon: LucideIcon; wrapClass: string; iconClass: string }
> = {
  wheelchair: {
    Icon: Accessibility,
    wrapClass: "bg-primary-fixed/25",
    iconClass: "text-primary",
  },
  node: {
    Icon: Radio,
    wrapClass: "bg-info-bg",
    iconClass: "text-info",
  },
  polar_sense: {
    Icon: HeartPulse,
    wrapClass: "bg-warning-bg",
    iconClass: "text-warning",
  },
  mobile_phone: {
    Icon: Smartphone,
    wrapClass: "bg-success-bg",
    iconClass: "text-success",
  },
};

/** Registry device card: icon + colors by `hardware_type`. */
export function registryDeviceCardPresentation(
  hardwareType: string,
): DeviceCardIconPresentation {
  const row = REGISTRY_MAP[hardwareType as HardwareType];
  if (row) {
    return { Icon: row.Icon, wrapClass: row.wrapClass, iconClass: row.iconClass };
  }
  return {
    Icon: Tablet,
    wrapClass: "bg-surface-container-high",
    iconClass: "text-on-surface-variant",
  };
}

/** Smart (HA-linked) device cards — single product icon. */
export function smartDeviceCardPresentation(): DeviceCardIconPresentation {
  return {
    Icon: HousePlug,
    wrapClass: "bg-primary-fixed/30",
    iconClass: "text-primary",
  };
}

/** Stable reference for list + empty states (presentation is constant). */
export const SMART_DEVICE_CARD_VISUAL = smartDeviceCardPresentation();
