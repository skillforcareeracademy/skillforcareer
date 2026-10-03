"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { TERM_KIND_LABEL, type TermKind } from "@/lib/validations/term";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * What a word means, without leaving the page.
 *
 * "When anyone read notes, meaning of a word should be visible by clicking on
 * that word." Rather than pre-processing the reading and wrapping every word in
 * markup — which would fight the editor's own HTML and break highlighting —
 * this listens for a double-click (or a selection, which is how it works on a
 * phone) anywhere inside the wrapped area and looks the word up.
 *
 * A word with no entry says so quietly rather than opening an empty card.
 */

interface Term {
  id: string;
  word: string;
  kind: TermKind;
  meaning: string;
  explanation: string | null;
  synonyms: string[];
  examples: string[];
  saved: boolean;
}

export function WordLookup({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState("");
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const look = useCallback(async (raw: string, x: number, y: number) => {
    const clean = raw.trim();
    if (clean.length < 2 || clean.length > 60) return;
    setWord(clean);
    setAt({ x, y });
    setBusy(true);
    setTerms(null);
    try {
      const res = await api.get<{ terms: Term[] }>(
        `/api/terms/lookup?word=${encodeURIComponent(clean)}`,
      );
      setTerms(res.terms);
    } catch {
      setTerms([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function onPick(e: MouseEvent) {
      const picked = window.getSelection()?.toString() ?? "";
      // One word, not a paragraph someone was copying.
      if (!picked || /\s/.test(picked.trim())) return;
      void look(picked, e.clientX, e.clientY);
    }
    host.addEventListener("dblclick", onPick);
    return () => host.removeEventListener("dblclick", onPick);
  }, [look]);

  async function toggleSave(term: Term) {
    const res = await api.post<{ saved: boolean }>(`/api/terms/${term.id}/bookmark`);
    setTerms((t) =>
      (t ?? []).map((x) => (x.id === term.id ? { ...x, saved: res.saved } : x)),
    );
  }

  function close() {
    setAt(null);
    setTerms(null);
    setWord("");
  }

  return (
    <div ref={hostRef} className="relative">
      {children}

      {at && (
        <>
          {/* Clicking anywhere else closes it. */}
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <Card
            className="fixed z-50 max-h-[60vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4 shadow-lg"
            style={{
              // Kept inside the window: a word near the right edge would
              // otherwise open a card that runs off the screen.
              left: Math.min(at.x, Math.max(16, window.innerWidth - 368)),
              top: Math.min(at.y + 12, Math.max(16, window.innerHeight - 320)),
            }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <BookOpen className="size-4" /> {word}
              </p>
              <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>

            {busy ? (
              <p className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
                <Loader2 className="size-4 animate-spin" /> Looking it up…
              </p>
            ) : terms && terms.length > 0 ? (
              <ul className="space-y-3">
                {terms.map((t) => (
                  <li key={t.id} className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.word}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {TERM_KIND_LABEL[t.kind] ?? t.kind}
                      </Badge>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void toggleSave(t)}
                        aria-label={t.saved ? "Remove from your words" : "Save for later"}
                      >
                        {t.saved ? (
                          <BookmarkCheck className="text-primary size-4" />
                        ) : (
                          <Bookmark className="size-4" />
                        )}
                      </Button>
                    </p>
                    <p className="text-sm">{t.meaning}</p>
                    {t.explanation && (
                      <p className="text-muted-foreground text-xs">{t.explanation}</p>
                    )}
                    {t.synonyms.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        Also: {t.synonyms.join(", ")}
                      </p>
                    )}
                    {t.examples.length > 0 && (
                      <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
                        {t.examples.map((ex) => (
                          <li key={ex}>{ex}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground py-2 text-sm">
                That word isn&apos;t in the dictionary yet.
              </p>
            )}
            <p className="text-muted-foreground mt-3 border-t pt-2 text-[11px]">
              Double-tap any word in the reading to look it up.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
