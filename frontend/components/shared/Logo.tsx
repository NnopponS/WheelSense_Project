import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  variant?: "auto" | "inverse";
}

export function Logo({ size = 56, className, variant = "auto" }: LogoProps) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Image
        src="/wheelsense-logo-black.svg"
        alt="WheelSense"
        width={1405}
        height={385}
        className={cn("object-contain", variant === "auto" ? "[.dark_&]:hidden" : "hidden [.dark_&]:block")}
        style={{ width: Math.round(size * 1405 / 385), height: size }}
      />
      <Image
        src="/wheelsense-logo-white.svg"
        alt="WheelSense"
        width={1405}
        height={385}
        className={cn("object-contain", variant === "auto" ? "hidden [.dark_&]:block" : "[.dark_&]:hidden")}
        style={{ width: Math.round(size * 1405 / 385), height: size }}
      />
    </span>
  );
}

export default Logo;
