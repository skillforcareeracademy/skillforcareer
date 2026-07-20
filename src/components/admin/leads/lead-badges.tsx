import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS, type LeadStatus, type LeadSource } from "@/lib/validations/lead";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  NEW: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  CONTACTED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  QUALIFIED: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  CONVERTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  LOST: "bg-muted text-muted-foreground",
};

export function STATUS_BADGE(status: string): ReactNode {
  return (
    <Badge variant="secondary" className={cn("gap-1", STATUS_CLASS[status] ?? "")}>
      {LEAD_STATUS_LABELS[status as LeadStatus] ?? status}
    </Badge>
  );
}

export function SOURCE_LABEL(source: string): string {
  return LEAD_SOURCE_LABELS[source as LeadSource] ?? source;
}
