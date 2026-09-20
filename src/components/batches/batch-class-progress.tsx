import Link from "next/link";
import { Layers } from "lucide-react";
import type { BatchClassProgress } from "@/server/services/class-schedule-service";
import { formatIstSlot } from "@/lib/ist";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "How many classes are completed and how many are pending" for each running
 * batch — shown on the admin and instructor schedule pages under the
 * calendar's summary tiles. Server-rendered; no interactivity needed.
 */
export function BatchClassProgressList({
  items,
  batchesHref,
}: {
  items: BatchClassProgress[];
  /** Where a batch name links to (the batches list of this panel). */
  batchesHref: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="text-muted-foreground size-4" /> Batch progress
          <span className="text-muted-foreground text-xs font-normal">classes completed vs pending</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => {
            const pct = b.stats.total ? Math.round((b.stats.completed / b.stats.total) * 100) : 0;
            return (
              <div key={b.batchId} className="rounded-xl border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={batchesHref} className="truncate text-sm font-medium hover:underline">
                    {b.batchName}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{pct}%</span>
                </div>
                <p className="text-muted-foreground truncate text-xs">{b.courseTitle}</p>
                <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs tabular-nums">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {b.stats.completed} completed
                  </span>
                  {" · "}
                  <span className="font-medium text-sky-600 dark:text-sky-400">{b.stats.pending} pending</span>
                  {b.stats.live > 0 && <> · {b.stats.live} live</>}
                  {b.stats.cancelled > 0 && (
                    <span className="text-muted-foreground"> · {b.stats.cancelled} cancelled</span>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                  {b.nextClassAt ? `Next: ${formatIstSlot(b.nextClassAt)}` : "No upcoming class"}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
