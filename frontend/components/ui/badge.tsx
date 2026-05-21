import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-muted text-foreground",
        secondary: "border-border/60 bg-surface-container-low text-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-success/35 bg-success-bg text-success",
        warning: "border-warning/35 bg-warning-bg text-warning",
        destructive: "border-critical/35 bg-critical-bg text-critical",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
