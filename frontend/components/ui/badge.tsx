import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-muted text-foreground",
        secondary: "border-border/60 bg-surface-container-low text-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-success/35 bg-success-bg text-success-foreground",
        warning: "border-warning/35 bg-warning-bg text-warning-foreground",
        destructive: "border-critical/35 bg-critical-bg text-critical-foreground",
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
