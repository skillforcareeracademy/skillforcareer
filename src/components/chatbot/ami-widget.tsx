"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
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

export function AmiWidget() {
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [voice, setVoice] = useState(false);
  const sessionRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={openChat}
          aria-label={`Chat with ${greeting.name}`}
          className="bg-primary text-primary-foreground fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg transition-transform hover:scale-105 md:bottom-6"
        >
          <MessageCircle className="size-5" />
          <span className="text-sm font-semibold">Ask {greeting.name}</span>
        </button>
      )}

      {/* Window */}
      {open && (
        <div className="bg-card fixed inset-x-3 bottom-20 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96 md:bottom-6">
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
