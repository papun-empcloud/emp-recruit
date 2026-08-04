/**
 * shadcn/ui — Skeleton. Themed with this app's palette utilities (see card.tsx).
 */
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-gray-100", className)} {...props} />;
}

export { Skeleton };
