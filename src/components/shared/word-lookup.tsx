"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  TERM_KIND_LABEL,
  normaliseWord,
  type TermKind,
} from "@/lib/validations/term";
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

/**
 * Underline every word the dictionary has a meaning for, in place, and make it
 * clickable — "all words in the chart … become clickable". Works on the rendered
 * text (never the source HTML), skips links/code and words already marked, so it
 * can be re-run safely and never fights the editor's own markup. All of it is
 * wrapped in a guard by the caller, so a decoration slip never breaks the reading.
 */
function markTerms(root: HTMLElement, keys: Set<string>): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (
        tag === "A" ||
        tag === "CODE" ||
        tag === "PRE" ||
        tag === "SCRIPT" ||
        tag === "STYLE" ||
        tag === "BUTTON" ||
        p.classList.contains("sfc-term")
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return /[a-zA-Z]/.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const texts: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) texts.push(node as Text);

  for (const textNode of texts) {
    const text = textNode.nodeValue ?? "";
    const re = /[A-Za-z][A-Za-z0-9-]*/g;
    const hits: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (keys.has(normaliseWord(m[0]))) {
        hits.push({ start: m.index, end: m.index + m[0].length });
      }
    }
    if (hits.length === 0) continue;

    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const { start, end } of hits) {
      if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
      const span = document.createElement("span");
      span.className = "sfc-term";
      span.textContent = text.slice(start, end);
      span.style.textDecoration = "underline dotted";
      span.style.textUnderlineOffset = "2px";
      span.style.textDecorationColor = "var(--primary)";
      span.style.cursor = "pointer";
      frag.appendChild(span);
      pos = end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
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

  // A single click on an underlined word opens its meaning too (not only a
  // double-click), which is how most readers expect a highlighted word to work.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(".sfc-term");
      if (!el) return;
      e.preventDefault();
      void look(el.textContent ?? "", e.clientX, e.clientY);
    }
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [look]);

  // The dictionary's words, fetched once, so the reading can underline the ones
  // it has a meaning for.
  const [termKeys, setTermKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ words: string[] }>("/api/terms/words")
      .then((d) => alive && setTermKeys(new Set(d.words)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Decorate the reading, and re-decorate if the content is (re)written — the
  // material body is set with innerHTML after this mounts. Our own edits are made
  // with the observer paused and skip words already marked, so there's no loop.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !termKeys || termKeys.size === 0) return;

    let running = false;
    const observer = new MutationObserver(() => {
      if (!running) requestAnimationFrame(apply);
    });
    function apply() {
      if (running) return;
      running = true;
      observer.disconnect();
      try {
        markTerms(host!, termKeys!);
      } catch {
        // Decoration must never break the reading itself.
      } finally {
        observer.observe(host!, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        running = false;
      }
    }
    apply();
    return () => observer.disconnect();
  }, [termKeys]);

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
