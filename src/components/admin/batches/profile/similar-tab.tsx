"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import type { SimilarBatch } from "@/server/services/batch-profile-service";
import { BATCH_STATUS_LABEL } from "@/lib/validations/batch";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BATCH_STATUS_BADGE, calendarDay } from "./format";
import { cn } from "@/lib/utils";

/** Other cohorts of the same course — handy for moving a learner or comparing pace. */
export function SimilarTab({
  similar,
  basePath,
}: {
  similar: SimilarBatch[];
  basePath: string;
}) {
  if (similar.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No other batches of this course"
        description="Other cohorts running the same course will be listed here."
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {similar.map((b) => {
        const cap = b.capacity ?? 0;
        const pct = cap
          ? Math.min(100, Math.round((b.learners / cap) * 100))
          : 0;
        const teachers = [b.instructorName, ...b.associateNames]
          .filter(Boolean)
          .join(", ");
        const body = (
          <Card
            className={cn(
              "h-full gap-2 p-4",
              b.canOpen && "hover:border-primary/50 transition-colors",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{b.name}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {b.code}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={cn("shrink-0", BATCH_STATUS_BADGE[b.status])}
              >
                {BATCH_STATUS_LABEL[b.status] ?? b.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {calendarDay(b.startDate)} – {calendarDay(b.endDate)}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {teachers || "No instructor yet"}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums">
                {b.learners}
                <span className="text-muted-foreground">
                  {cap ? ` / ${cap} seats` : " learners"}
                </span>
              </span>
              {cap > 0 && (
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct >= 100 ? "bg-rose-500" : "bg-primary",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </Card>
        );
        return b.canOpen ? (
          <Link
            key={b.id}
            href={`${basePath}/batches/${b.id}`}
            className="block"
          >
            {body}
          </Link>
        ) : (
          <div key={b.id}>{body}</div>
        );
      })}
    </div>
  );
}
