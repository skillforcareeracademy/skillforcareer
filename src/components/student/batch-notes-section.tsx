"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, NotebookPen, Paperclip } from "lucide-react";
import type { StudentBatchNote } from "@/server/services/batch-note-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { when } from "@/components/admin/batches/profile/format";
import { WordLookup } from "@/components/shared/word-lookup";

/**
 * Notes and material the learner's batches have shared — slides, reading, a
 * worksheet. Rendered on My Learning; the app reads the same list from
 * `GET /api/student/batch-notes`.
 *
 * Opening one starts a clock. The academy wanted reading time on the report
 * card, so the reader sends a heartbeat every twenty seconds while the note is
 * open and the tab is in front — nothing is counted for a note left open behind
 * another window, and the remainder is flushed on the way out.
 */

const HEARTBEAT_MS = 20_000;

function readable(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function send(noteId: string, seconds: number, opened: boolean) {
  const body = JSON.stringify({ seconds, opened });
  // keepalive, because the last beat is often sent as the page goes away.
  void fetch(`/api/student/notes/${noteId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Counts time for whichever note is open, and reports it as it goes. */
function useReadingClock(noteId: string | null): { id: string; seconds: number } | null {
  const [progress, setProgress] = useState<{ id: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!noteId) return;
    const id = noteId;
    send(id, 0, true);

    let counted = 0;
    let since = Date.now();
    let visible = document.visibilityState === "visible";

    /** Seconds since the last beat, or none if they were looking elsewhere. */
    function take(): number {
      const now = Date.now();
      const seconds = visible ? Math.round((now - since) / 1000) : 0;
      since = now;
      return seconds;
    }

    function beat(report: boolean): void {
      const seconds = take();
      if (seconds <= 0) return;
      counted += seconds;
      send(id, seconds, false);
      if (report) setProgress({ id, seconds: counted });
    }

    function onVisibility(): void {
      // Leaving the tab banks what has been read so far; coming back restarts
      // the clock from now rather than from when they left.
      beat(true);
      visible = document.visibilityState === "visible";
      since = Date.now();
    }

    const tick = () => beat(true);
    const leave = () => beat(false);
    const timer = window.setInterval(tick, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      // The last stretch still reaches the server; the badge catches up on the
      // next load rather than setting state on the way out.
      beat(false);
    };
  }, [noteId]);

  return progress;
}

export function BatchNotesSection({ notes }: { notes: StudentBatchNote[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const progress = useReadingClock(openId);

  if (notes.length === 0) return null;

  const open = notes.find((n) => n.id === openId) ?? null;

  return (
    <section id="batch-notes" className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <NotebookPen className="size-5 text-rose-500" /> Batch notes
        </h2>
        <p className="text-muted-foreground text-sm">
          Shared by your instructors with your batch.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {notes.map((n) => {
          const seconds =
            n.readSeconds + (progress?.id === n.id ? progress.seconds : 0);
          return (
            <Card key={n.id} className="gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {n.batchName} · {n.courseTitle} ·{" "}
                    {when(n.createdAt, { time: false })}
                  </p>
                </div>
                {seconds > 0 && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <BookOpenCheck className="size-3" /> {readable(seconds)}
                  </Badge>
                )}
              </div>
              {n.body && (
                <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-line">
                  {n.body}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpenId(n.id)}>
                  {seconds > 0 ? "Read again" : "Read note"}
                </Button>
                {n.fileUrl && (
                  <a
                    href={n.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-muted/60 hover:bg-muted flex min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <Paperclip className="size-4 shrink-0" />
                    <span className="truncate">{n.fileName || "Open attachment"}</span>
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => setOpenId(v ? openId : null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
                <DialogDescription>
                  {open.batchName} · {open.courseTitle} ·{" "}
                  {when(open.createdAt, { time: false })}
                </DialogDescription>
              </DialogHeader>
              {open.body ? (
                /* Same lookup as the study material: double-tap a word to see
                   what it means. */
                <WordLookup>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{open.body}</p>
                </WordLookup>
              ) : (
                <p className="text-muted-foreground text-sm">
                  This note has no text of its own — open the attachment below.
                </p>
              )}
              {open.fileUrl && (
                <a
                  href={open.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-muted/60 hover:bg-muted flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <Paperclip className="size-4 shrink-0" />
                  <span className="truncate">{open.fileName || "Open attachment"}</span>
                </a>
              )}
              <p className="text-muted-foreground text-xs">
                Your reading time is recorded on your report card.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
