"use client";

import { useState, type FormEvent } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "This question looks wrong."
 *
 * The learner's side of the review queue: one button under a question, a line
 * about what they think is wrong, and a reference number back. The answer
 * reaches them by email and in their notifications, so there is nothing else
 * for them to check.
 */
export function QuestionReportDialog({
  quizId,
  questionId,
  questionNo,
}: {
  quizId: string;
  questionId: string;
  questionNo: number;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [raised, setRaised] = useState<{ ref: string; message: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await api.post<{ ref: string; message: string }>(
        `/api/quizzes/${quizId}/reviews`,
        { questionId, message: message.trim() || undefined },
      );
      setRaised(res);
      toast.success(`Review request ${res.ref} submitted.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send that just now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <Flag className="size-3.5" />
        {raised ? `Reported · ${raised.ref}` : "Report a mistake"}
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && raised) setMessage("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report a mistake in question {questionNo}</DialogTitle>
            <DialogDescription>
              Your instructor or an admin will look at it and write back.
            </DialogDescription>
          </DialogHeader>

          {raised ? (
            <div className="space-y-3">
              <p className="text-sm">{raised.message}</p>
              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What looks wrong? (optional)"
                maxLength={1000}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending && <Loader2 className="size-4 animate-spin" />}
                  Send for review
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
