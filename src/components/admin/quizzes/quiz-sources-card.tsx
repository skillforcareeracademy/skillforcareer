"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2Off, NotebookText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface QuizSourceRow {
  id: string;
  title: string;
  kind: "BATCH_NOTE" | "LESSON" | "TEXT";
  /** The batch the notes belong to, when they are batch notes. */
  where: string | null;
  hasText: boolean;
}

const KIND_LABEL: Record<QuizSourceRow["kind"], string> = {
  BATCH_NOTE: "Batch notes",
  LESSON: "Lesson",
  TEXT: "Pasted notes",
};

/**
 * The notes a paper was prepared from.
 *
 * Worth recording for its own sake — a year later, whoever revises the paper
 * knows which notes it has to agree with — and it is also what the generator
 * reads, so the two live together.
 */
export function QuizSourcesCard({
  quizId,
  sources,
  onGenerate,
}: {
  quizId: string;
  sources: QuizSourceRow[];
  onGenerate: () => void;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  async function unlink(id: string) {
    setRemoving(id);
    try {
      await api.del(`/api/quizzes/${quizId}/sources/${id}`);
      toast.success("Notes unlinked.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't unlink those notes.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <NotebookText className="size-4" /> Prepared from
          </CardTitle>
          <CardDescription>
            The notes this quiz was set from. Learners see them as what to revise.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={onGenerate}>
          <Sparkles className="size-4" /> Generate from notes
        </Button>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <div className="rounded-xl border border-dashed py-8 text-center">
            <FileText className="text-muted-foreground mx-auto mb-2 size-6" />
            <p className="text-sm font-medium">No notes linked yet</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
              Link the batch notes or the lesson this paper tests — or let the generator draft the
              questions from them and link them as it goes.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {KIND_LABEL[s.kind]}
                    </Badge>
                    {s.where && <span className="truncate">{s.where}</span>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={removing === s.id}
                  onClick={() => unlink(s.id)}
                >
                  <Link2Off className="size-4" /> Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
