"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speak, stopSpeaking, speechSupported, warmVoices } from "@/lib/speech";
import { tourFor, tourStorageKey, type TourStep } from "@/config/tours";
import type { Role } from "@/config/roles";
import { cn } from "@/lib/utils";

/**
 * The guided walkthrough of a panel, with an optional voice-over.
 *
 * It runs itself the first time someone opens their dashboard and never again
 * unless they ask for it — the flag lives in `localStorage`, which is exactly
 * the sort of per-viewer convenience it's good for, and a cleared browser
 * showing the tour once more is a harmless outcome.
 *
 * Highlighting works off the nav hrefs rather than injected ids: the sidebar
 * already renders `<a href="/student/quizzes">`, so the tour can find its
 * target without every nav item having to know a tour exists. A step whose
 * target isn't on screen still shows its card, just without the spotlight.
 */

interface Spotlight {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function PanelTour({
  role,
  voiceEnabled = true,
}: {
  role: Role;
  /** Admin → Settings can turn the voice-over off platform-wide. */
  voiceEnabled?: boolean;
}) {
  const steps = tourFor(role);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [voice, setVoice] = useState(false);
  const [spot, setSpot] = useState<Spotlight | null>(null);

  const step: TourStep | undefined = steps[index];

  // Autostart once per role, per tour version.
  //
  // Opened from a timer rather than straight from the effect body: the panel
  // should finish painting before a full-screen overlay lands on it, and the
  // compiler's `set-state-in-effect` rule rejects a synchronous setState here
  // for the same reason — it would cascade a second render before first paint.
  useEffect(() => {
    warmVoices();
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(tourStorageKey(role)));
    } catch {
      // A browser with site data blocked gets the tour each visit rather than
      // an exception.
      seen = true;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [role]);

  // "Replay the tour" from the user menu dispatches this.
  useEffect(() => {
    function onReplay() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener("sfc:start-tour", onReplay);
    return () => window.removeEventListener("sfc:start-tour", onReplay);
  }, []);

  /**
   * Keep the spotlight over the current step's nav item.
   *
   * `measure` is defined inside the effect rather than in a `useCallback`: the
   * compiler can't preserve the memo across the setState calls, and the
   * function has no life outside this subscription anyway. The first
   * measurement runs on a frame so it reads a laid-out element, not one still
   * being positioned.
   */
  useEffect(() => {
    if (!open) return;

    const href = step?.href;
    function measure() {
      if (!href) {
        setSpot(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`a[href="${href}"]`);
      if (!el) {
        setSpot(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setSpot({
        top: r.top - 4,
        left: r.left - 4,
        width: r.width + 8,
        height: r.height + 8,
      });
    }

    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  // Read the step aloud whenever the voice is on and the step changes.
  useEffect(() => {
    if (!open || !voice || !step) return;
    speak(`${step.title}. ${step.body}`);
  }, [open, voice, step]);

  useEffect(() => {
    if (!open) stopSpeaking();
    return () => stopSpeaking();
  }, [open]);

  function finish() {
    stopSpeaking();
    setOpen(false);
    setVoice(false);
    try {
      localStorage.setItem(tourStorageKey(role), String(Date.now()));
    } catch {
      /* nothing to do — the tour just runs again next time */
    }
  }

  function go(delta: number) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      finish();
      return;
    }
    stopSpeaking();
    setIndex(next);
  }

  if (!open || !step) return null;

  const isLast = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Panel tour">
      {/* Dim. A separate ring rather than a box-shadow cut-out so the target
          stays fully interactive-looking without the overlay swallowing it. */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={finish}
        aria-hidden
      />

      {spot && (
        <div
          className="ring-primary pointer-events-none absolute rounded-xl ring-2 ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
          aria-hidden
        />
      )}

      {/* The card. Bottom-centre on a phone, bottom-left on a desktop so it
          doesn't sit on top of the sidebar it's pointing at. */}
      <div
        className={cn(
          "bg-card absolute right-4 bottom-4 left-4 rounded-2xl border p-5 shadow-2xl",
          "sm:right-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2",
          "lg:left-[19rem] lg:translate-x-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Compass className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{step.title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {step.body}
            </p>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip the tour"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-lg p-1.5"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.title}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= index ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {index + 1}/{steps.length}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {voiceEnabled && speechSupported() && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVoice((on) => {
                  if (on) stopSpeaking();
                  else speak(`${step.title}. ${step.body}`);
                  return !on;
                });
              }}
              aria-pressed={voice}
            >
              {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              {voice ? "Voice on" : "Voice guide"}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={() => go(-1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            <Button size="sm" onClick={() => go(1)}>
              {isLast ? "Finish" : "Next"}
              {!isLast && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
