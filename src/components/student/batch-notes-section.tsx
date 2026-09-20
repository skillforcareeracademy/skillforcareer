import { NotebookPen, Paperclip } from "lucide-react";
import type { StudentBatchNote } from "@/server/services/batch-note-service";
import { Card } from "@/components/ui/card";
import { when } from "@/components/admin/batches/profile/format";

/**
 * Notes and material the learner's batches have shared — slides, reading, a
 * worksheet. Rendered on My Learning; the app reads the same list from
 * `GET /api/student/batch-notes`.
 */
export function BatchNotesSection({ notes }: { notes: StudentBatchNote[] }) {
  if (notes.length === 0) return null;

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
        {notes.map((n) => (
          <Card key={n.id} className="gap-2 p-4">
            <div className="min-w-0">
              <p className="font-medium">{n.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {n.batchName} · {n.courseTitle} ·{" "}
                {when(n.createdAt, { time: false })}
              </p>
            </div>
            {n.body && (
              <p className="text-muted-foreground text-sm whitespace-pre-line">
                {n.body}
              </p>
            )}
            {n.fileUrl && (
              <a
                href={n.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-muted/60 hover:bg-muted flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <Paperclip className="size-4 shrink-0" />
                <span className="truncate">
                  {n.fileName || "Open attachment"}
                </span>
              </a>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
