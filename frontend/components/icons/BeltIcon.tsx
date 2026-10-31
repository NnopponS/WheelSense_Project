import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Waist-belt wearable icon (strap + buckle) drawn in lucide stroke style. */
export const BeltIcon = forwardRef<SVGSVGElement, LucideProps>(function BeltIcon(
  { size = 24, strokeWidth = 2, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M2 12h6.5" />
      <path d="M15.5 12H22" />
      <rect x="8.5" y="8" width="7" height="8" rx="1" />
      <path d="M12 9.5v5" />
    </svg>
  );
});
