"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecordingPlayer } from "@/components/student/recording-player";
import type { AdminRecordingRow } from "@/server/services/recording-request-service";

/** This batch's class recordings — always available to staff, playable here. */
export function BatchRecordingsTab({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<AdminRecordingRow[] | null>(null);
  const [playing, setPlaying] = useState<AdminRecordingRow | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<AdminRecordingRow[]>(`/api/batches/${batchId}/recordings`)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [batchId]);

  if (rows === null) {
    return (
      <p className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading recordings…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="items-center py-12 text-center">
        <Film className="text-muted-foreground mb-2 size-8" />
        <p className="text-sm font-medium">No recordings for this batch yet.</p>
        <p className="text-muted-foreground mt-1 text-xs">
          A class recording shows here once it has been uploaded.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <a
          href={`/api/recordings/zip?batch=${batchId}`}
          download
          className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Download className="size-4" /> Download all (zip)
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((rec) => (
          <Card key={rec.id} className="gap-0 overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setPlaying(rec)}
              className="group relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900"
            >
              <PlayCircle className="size-11 text-white/90 transition-transform group-hover:scale-110" />
              <Badge
                variant="secondary"
                className="absolute top-2.5 left-2.5 gap-1 bg-black/50 text-[10px] text-white backdrop-blur"
              >
                {rec.published ? (
                  <>
                    <CheckCircle2 className="size-3" /> Published
                  </>
                ) : (
                  "Unpublished"
                )}
              </Badge>
            </button>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="line-clamp-2 leading-snug font-semibold">{rec.title}</h3>
              <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
                <CalendarClock className="size-3.5 shrink-0" />
                {format(new Date(rec.scheduledStart), "d MMM yyyy")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => setPlaying(rec)}
              >
                <PlayCircle className="size-4" /> Play recording
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={playing !== null} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="gap-3 p-4 sm:max-w-3xl sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="leading-snug">{playing?.title}</DialogTitle>
            <DialogDescription>
              {playing ? format(new Date(playing.scheduledStart), "d MMM yyyy") : ""}
            </DialogDescription>
          </DialogHeader>
          {playing && (
            <RecordingPlayer key={playing.id} meetingId={playing.id} watermarkPrice={null} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
