"use client";

import { forwardRef, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Text input with a leading icon. Forwards refs for React Hook Form. */
export const IconInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof Input> & { icon: LucideIcon }
>(function IconInput({ icon: Icon, className, ...props }, ref) {
  return (
    <div className="relative">
      <Icon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input ref={ref} className={cn("h-11 pl-9", className)} {...props} />
    </div>
  );
});
