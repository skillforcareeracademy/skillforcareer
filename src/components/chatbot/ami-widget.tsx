"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  GripVertical,
  Loader2,
  MessageCircle,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { speak, stopSpeaking, speechSupported } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * Ami — the floating assistant, on the public site and inside every panel.
 *
 * Answers come from Admin → Assistant and nowhere else, so the academy is
 * never quoting a price or a placement figure it didn't write. Anything Ami
 * can't answer lands in the "teach Ami" queue, which is what makes the thing
 * get better over time rather than just look clever on day one.
 */

interface Suggestion {
  id: string;
  question: string;
}

interface Line {
  id: string;
  role: "user" | "bot";
  text: string;
  action?: { label: string; url: string } | null;
  suggestions?: Suggestion[];
}

interface Greeting {
  enabled: boolean;
  name: string;
  greeting: string;
  suggestions: Suggestion[];
}

/** One id per browser tab's conversation — groups the transcript for admins. */
function newSessionId(): string {
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Where the launcher sits. Ami floats over every page, so on a long table it
 * can sit on top of the very row somebody is reading — the academy asked for it
 * to be movable, and where they drag it is remembered per browser.
 */
interface Point {
  x: number;
  y: number;
}

const POSITION_KEY = "sfc.ami.position";
const EDGE = 16;
/**
 * The launcher's own footprint, near enough. Measuring it would mean reading a
 * ref while rendering, and a few pixels either way only ever changes how close
 * to the edge it can be dragged.
 */
const LAUNCHER = { width: 172, height: 48 };
/** Past this many pixels a press is a drag, not a click on the launcher. */
const DRAG_THRESHOLD = 4;

function readSavedPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    // Private windows and blocked site data both land here; the default corner
    // is a perfectly good answer.
    return null;
  }
}

function savePosition(point: Point) {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(point));
  } catch {
    // Nothing to do — the launcher still moved for this visit.
  }
}

/** Keep the launcher fully on screen, whatever the window has been resized to. */
function clampToViewport(point: Point, size: { width: number; height: number }): Point {
  const maxX = Math.max(EDGE, window.innerWidth - size.width - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - size.height - EDGE);
  return {
    x: Math.min(Math.max(point.x, EDGE), maxX),
    y: Math.min(Math.max(point.y, EDGE), maxY),
  };
}

export function AmiWidget() {
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [voice, setVoice] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const sessionRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Pointer offset inside the launcher, so it doesn't jump under the cursor. */
  const grabRef = useRef<Point>({ x: 0, y: 0 });
  /** Where the press began — what the drag threshold is measured against. */
  const startRef = useRef<Point>({ x: 0, y: 0 });
  const movedRef = useRef(false);

  // The greeting also carries the on/off switch, so a disabled assistant costs
  // one request and renders nothing.
  useEffect(() => {
    api.get<Greeting>("/api/chat").then(
      (g) => setGreeting(g),
      () => setGreeting(null),
    );
  }, []);

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  // Never leave the browser talking after the window is shut.
  useEffect(() => {
    if (!open) stopSpeaking();
    return () => stopSpeaking();
  }, [open]);

  // Where it was left last time, brought back inside the current window.
  //
  // Read on a timer rather than straight from the effect body: the page should
  // paint in the default corner first, and the compiler's `set-state-in-effect`
  // rule rejects a synchronous setState here for the same reason — same
  // reasoning as the panel tour's autostart.
  useEffect(() => {
    if (!greeting?.enabled) return;
    const saved = readSavedPosition();
    if (!saved) return;
    const id = setTimeout(() => setPosition(clampToViewport(saved, LAUNCHER)), 0);
    return () => clearTimeout(id);
  }, [greeting?.enabled]);

  // A narrower window can leave a remembered spot off-screen.
  useEffect(() => {
    if (!position) return;
    const onResize = () => setPosition((p) => (p ? clampToViewport(p, LAUNCHER) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [position]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    // Left mouse button, a finger or a pen; never a right-click.
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    grabRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    // Pointer capture keeps the moves coming even when the cursor outruns the
    // button, which is most of a drag.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    // Measured from where the press began, not from the last known position:
    // the very first drag starts from the corner the stylesheet put it in,
    // which this component has never had to know a number for.
    if (
      !movedRef.current &&
      Math.abs(e.clientX - startRef.current.x) < DRAG_THRESHOLD &&
      Math.abs(e.clientY - startRef.current.y) < DRAG_THRESHOLD
    ) {
      return; // still a click as far as anyone can tell
    }
    movedRef.current = true;
    setPosition(
      clampToViewport({ x: e.clientX - grabRef.current.x, y: e.clientY - grabRef.current.y }, LAUNCHER),
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    if (movedRef.current && position) savePosition(position);
  }

  /**
   * Opening is left on `click` rather than on `pointerup` so that Enter and
   * Space still work; the flag swallows the click the browser fires at the end
   * of a drag.
   */
  function onLauncherClick() {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    openChat();
  }

  /** Keyboard: nudge it with the arrows, and Enter/Space still opens the chat. */
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 40 : 10;
    const deltas: Record<string, Point> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const from = position ?? {
      // Never moved yet: start from the corner the classes put it in.
      x: window.innerWidth - LAUNCHER.width - EDGE,
      y: window.innerHeight - LAUNCHER.height - (window.innerWidth < 768 ? 80 : 24),
    };
    const next = clampToViewport({ x: from.x + delta.x, y: from.y + delta.y }, LAUNCHER);
    setPosition(next);
    savePosition(next);
  }

  function openChat() {
    if (!sessionRef.current) sessionRef.current = newSessionId();
    if (lines.length === 0 && greeting) {
      setLines([
        {
          id: "greeting",
          role: "bot",
          text: greeting.greeting,
          suggestions: greeting.suggestions,
        },
      ]);
    }
    setOpen(true);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || sending) return;

    setDraft("");
    setLines((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", text },
    ]);
    setSending(true);
    stopSpeaking();

    try {
      const reply = await api.post<{
        answer: string;
        action: { label: string; url: string } | null;
        suggestions: Suggestion[];
      }>("/api/chat", { question: text, sessionId: sessionRef.current });

      setLines((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          role: "bot",
          text: reply.answer,
          action: reply.action,
          suggestions: reply.suggestions,
        },
      ]);
      if (voice) speak(reply.answer);
    } catch {
      setLines((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "bot",
          text: "Sorry — I couldn't reach the server just then. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function toggleVoice() {
    setVoice((on) => {
      if (on) stopSpeaking();
      return !on;
    });
  }

  if (!greeting?.enabled) return null;

  /**
   * Placement for the chat window once the launcher has been moved. Phone-width
   * screens keep the full-width sheet at the bottom — there is nowhere else for
   * a 96-character-wide conversation to go.
   */
  const windowStyle = ((): React.CSSProperties | null => {
    if (!position || typeof window === "undefined") return null;
    if (window.innerWidth < 640) return null;
    const width = 384; // sm:w-96
    const left = Math.min(
      Math.max(position.x + LAUNCHER.width - width, EDGE),
      Math.max(EDGE, window.innerWidth - width - EDGE),
    );
    // Above the launcher when it is sitting low, below it when it is high.
    const below = position.y < window.innerHeight / 2;
    return below
      ? {
          left,
          top: Math.min(position.y + LAUNCHER.height + 12, window.innerHeight - 160),
          right: "auto",
          bottom: "auto",
        }
      : { left, bottom: Math.max(window.innerHeight - position.y + 12, EDGE), right: "auto", top: "auto" };
  })();

  return (
    <>
      {/* Launcher — draggable, so it never has to sit on top of the page */}
      {!open && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onLauncherClick}
          onKeyDown={onKeyDown}
          aria-label={`Chat with ${greeting.name}. Drag to move, or use the arrow keys.`}
          title="Drag to move"
          style={
            position
              ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
              : undefined
          }
          className={cn(
            "bg-primary text-primary-foreground fixed z-40 flex touch-none items-center gap-2 rounded-full py-3 pr-4 pl-3 shadow-lg",
            dragging ? "cursor-grabbing scale-105" : "cursor-grab transition-transform hover:scale-105",
            // Until it has been moved it sits where it always has: clear of the
            // mobile tab bar, low right on a desktop.
            position ? "" : "right-4 bottom-20 md:bottom-6",
          )}
        >
          <GripVertical className="size-4 opacity-70" aria-hidden />
          <MessageCircle className="size-5" />
          <span className="text-sm font-semibold">Ask {greeting.name}</span>
        </button>
      )}

      {/* Window — opens next to wherever the launcher was dragged to */}
      {open && (
        <div
          style={windowStyle ?? undefined}
          className={cn(
            "bg-card fixed z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:w-96",
            windowStyle ? "inset-x-3 sm:inset-x-auto" : "inset-x-3 bottom-20 sm:inset-x-auto sm:right-4 md:bottom-6",
          )}
        >
          <div className="bg-primary text-primary-foreground flex items-center gap-2.5 px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/20">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{greeting.name}</p>
              <p className="truncate text-xs opacity-80">
                SkillForCareer assistant
              </p>
            </div>
            {speechSupported() && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={voice ? "Turn the voice off" : "Read answers aloud"}
                aria-pressed={voice}
                className="rounded-lg p-1.5 hover:bg-white/15"
              >
                {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 hover:bg-white/15"
            >
              <X className="size-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {lines.map((line) => (
              <div key={line.id} className="space-y-2">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                    line.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto rounded-br-md"
                      : "bg-muted rounded-bl-md",
                  )}
                >
                  {line.text}
                </div>

                {line.action && (
                  <Link
                    href={line.action.url}
                    className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    {line.action.label} <ArrowUpRight className="size-3.5" />
                  </Link>
                )}

                {line.suggestions && line.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {line.suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => ask(s.question)}
                        className="border-border hover:border-primary/60 hover:text-primary rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
                      >
                        {s.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="bg-muted flex w-fit items-center gap-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm">
                <Loader2 className="size-3.5 animate-spin" />
                <span className="text-muted-foreground">Thinking…</span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 border-t p-3"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Ask ${greeting.name} anything…`}
              maxLength={500}
              aria-label="Your question"
            />
            <Button type="submit" size="icon" disabled={sending || !draft.trim()}>
              <Send className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
