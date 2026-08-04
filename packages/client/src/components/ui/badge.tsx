/**
 * shadcn/ui — Badge
 *
 * Standard shadcn structure (cva variants + `badgeVariants` export so callers
 * can borrow the classes), themed with this app's palette utilities so the
 * `.dark` remap in styles/globals.css keeps working. See card.tsx for the full
 * rationale.
 *
 * The `success` / `warning` / `destructive` variants are the status roles — use
 * them only when the colour genuinely means good/caution/bad, and always with
 * text or an icon beside them so meaning is never carried by colour alone.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-50 text-brand-700",
        secondary: "border-transparent bg-gray-100 text-gray-700",
        outline: "border-gray-200 text-gray-700",
        success: "border-transparent bg-green-50 text-green-700",
        warning: "border-transparent bg-amber-50 text-amber-700",
        destructive: "border-transparent bg-red-50 text-red-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
