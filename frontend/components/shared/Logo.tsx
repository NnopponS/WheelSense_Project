"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  color?: string;
}

/**
 * Official WheelSense Logo Component (B&W Minimalist)
 * Represents a wheel with a 'W' in the center and a sensing dot.
 */
export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ size = 40, className, color = "currentColor", ...props }, ref) => {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("shrink-0", className)}
        ref={ref}
        {...props}
      >
        {/* Circle with a break on the right side */}
        <path
          d="M 90 50 A 40 40 0 1 1 90 49"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* The Sensing Dot on the right side */}
        <circle cx="90" cy="50" r="7" fill={color} />

        {/* Minimalist 'W' in the center */}
        <text
          x="50"
          y="64"
          fontSize="36"
          fontWeight="900"
          fill={color}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ userSelect: "none" }}
        >
          W
        </text>
      </svg>
    );
  }
);

Logo.displayName = "Logo";

export default Logo;
