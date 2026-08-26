"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The icon-only save toggle on a quiz card. Same endpoint as the labelled
 * button on the quiz itself, so a quiz saved in one place shows saved in the
 * other and lands under Student → Notes either way.
 */
export function QuizBookmarkToggle({
  quizId,
  bookmarked,
}: {
  quizId: string;
  bookmarked: boolean;
}) {
  const [saved, setSaved] = useState(bookmarked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !saved;
    setSaved(next);
    try {
      const res = await api.post<{ saved: boolean }>(`/api/quizzes/${quizId}/bookmark`, {});
      setSaved(res.saved);
      toast.success(res.saved ? "Saved for later." : "Removed from saved.");
    } catch (e) {
      setSaved(!next);
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      className={saved ? "text-primary" : "text-muted-foreground"}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </Button>
  );
}
