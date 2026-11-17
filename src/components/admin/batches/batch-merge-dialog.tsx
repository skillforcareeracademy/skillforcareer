"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Merge, Split } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BatchMergeInfo,
  MergeableBatch,
} from "@/server/services/batch-merge-service";

export function BatchMergeDialog({
  open,
  onOpenChange,
  batches,
  merges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: MergeableBatch[];
  merges: BatchMergeInfo[];
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(batches.map((b) => [b.id, b]));
    return (id: string) => m.get(id);
  }, [batches]);

  // Batches already folded into a live merge can't be merged again.
  const locked = useMemo(() => {
    const s = new Set<string>();
    for (const m of merges) {
      s.add(m.targetBatchId);
      for (const id of m.sourceBatchIds) s.add(id);
    }
    return s;
  }, [merges]);

  // Courses that still have two or more free batches to merge.
  const courses = useMemo(() => {
    const free = batches.filter((b) => !locked.has(b.id));
    const byCourse = new Map<string, { id: string; title: string; count: number }>();
    for (const b of free) {
      const cur = byCourse.get(b.courseId);
      if (cur) cur.count += 1;
      else byCourse.set(b.courseId, { id: b.courseId, title: b.courseTitle, count: 1 });
    }
    return [...byCourse.values()].filter((c) => c.count >= 2);
  }, [batches, locked]);

  const courseBatches = useMemo(
    () => batches.filter((b) => b.courseId === courseId && !locked.has(b.id)),
    [batches, courseId, locked],
  );

  function reset() {
    setCourseId("");
    setTargetId("");
    setSources(new Set());
  }

  function pickCourse(id: string) {
    setCourseId(id);
    setTargetId("");
    setSources(new Set());
  }

  function pickTarget(id: string) {
    setTargetId(id);
    setSources((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSource(id: string, on: boolean) {
    setSources((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function merge() {
    if (!targetId || sources.size === 0) {
      toast.error("Choose the batch to keep and at least one to merge in.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/batches/merge", {
        targetBatchId: targetId,
        sourceBatchIds: [...sources],
      });
      toast.success("Batches merged.");
      reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't merge those.");
    } finally {
      setBusy(false);
    }
  }

  async function separate(id: string) {
    setBusy(true);
    try {
      await api.post(`/api/batches/merge/${id}/separate`);
      toast.success("Batches separated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't separate those.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), o || reset())}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge batches</DialogTitle>
          <DialogDescription>
            Fold one or more batches into another — their learners, classes,
            attendance, quizzes, assignments, material and trainers all move
            across. Only batches of the same course can be merged, and you can
            separate them again any time.
          </DialogDescription>
        </DialogHeader>

        {/* Live merges, each with a way back. */}
        {merges.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Merged</p>
            <ul className="divide-y rounded-xl border">
              {merges.map((m) => {
                const target = nameOf(m.targetBatchId);
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {target?.name ?? "A batch"}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          keeps{" "}
                          {m.sourceBatchIds
                            .map((id) => nameOf(id)?.name ?? "a batch")
                            .join(", ")}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {target?.code}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => separate(m.id)}
                    >
                      <Split className="size-4" /> Separate
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Build a new merge. */}
        {courses.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            A course needs two or more free batches before they can be merged.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={courseId} onValueChange={(v) => v && pickCourse(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a course">
                    {(v) => courses.find((c) => c.id === v)?.title ?? "Choose a course"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} ({c.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {courseId && (
              <>
                <div className="space-y-1.5">
                  <Label>Keep this batch</Label>
                  <Select value={targetId} onValueChange={(v) => v && pickTarget(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="The batch everything moves into">
                        {(v) => {
                          const b = courseBatches.find((x) => x.id === v);
                          return b ? `${b.name} · ${b.code}` : "The batch everything moves into";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {courseBatches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} · {b.code} ({b.enrolledCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {targetId && (
                  <div className="space-y-1.5">
                    <Label>Merge in</Label>
                    <ul className="divide-y rounded-xl border">
                      {courseBatches
                        .filter((b) => b.id !== targetId)
                        .map((b) => (
                          <li key={b.id} className="flex items-center gap-3 p-3">
                            <Checkbox
                              id={`src-${b.id}`}
                              checked={sources.has(b.id)}
                              onCheckedChange={(on) => toggleSource(b.id, Boolean(on))}
                            />
                            <Label
                              htmlFor={`src-${b.id}`}
                              className="flex-1 cursor-pointer font-normal"
                            >
                              {b.name}{" "}
                              <span className="text-muted-foreground">
                                · {b.code} · {b.enrolledCount} learner
                                {b.enrolledCount === 1 ? "" : "s"}
                              </span>
                            </Label>
                          </li>
                        ))}
                    </ul>
                    {courseBatches.length < 2 && (
                      <p className="text-muted-foreground text-xs">
                        No other free batch on this course to merge in.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={merge}
                  disabled={busy || !targetId || sources.size === 0}
                  className="w-full"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Merge className="size-4" />
                  )}
                  Merge {sources.size > 0 ? `${sources.size} ` : ""}into the kept batch
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
