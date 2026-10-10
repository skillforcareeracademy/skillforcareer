"use client";

import { useEffect, useRef } from "react";
import { Check, DoorOpen, X } from "lucide-react";
import type { KnockRequest } from "./use-live-room";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Who is at the door.
 *
 * It sits over the faces rather than in a side panel, and it makes a sound,
 * because an instructor mid-sentence is not watching the corner of the screen
 * — "instructor ke paas notification show sound ke saath". One decision per
 * person, and one for the lot when a class turns up together.
 */
export function KnockPanel({
  knocking,
  onAdmit,
  onDeny,
}: {
  knocking: KnockRequest[];
  onAdmit: (socketId?: string) => void;
  onDeny: (socketId: string) => void;
}) {
  // Two soft notes on the Web Audio API rather than an audio file: no asset to
  // ship, no request to fail, and nothing to go missing from the cache.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = knocking.filter((k) => !seen.current.has(k.socketId));
    for (const k of knocking) seen.current.add(k.socketId);
    // Forget anybody who has gone, so a second visit chimes again.
    const here = new Set(knocking.map((k) => k.socketId));
    for (const id of seen.current) if (!here.has(id)) seen.current.delete(id);
    if (fresh.length === 0) return;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const at = ctx.currentTime;
      for (const [i, hz] of [784, 1047].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        // A short bell-ish decay. A square wave or a hard stop reads as an
        // error sound, which this is not.
        gain.gain.setValueAtTime(0.0001, at + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.14, at + i * 0.14 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.14 + 0.32);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at + i * 0.14);
        osc.stop(at + i * 0.14 + 0.34);
      }
      window.setTimeout(() => void ctx.close().catch(() => {}), 1200);
    } catch {
      // A browser that will not make a sound still shows the panel.
    }
  }, [knocking]);

  if (knocking.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute top-4 right-4 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <DoorOpen className="size-4 text-emerald-300" />
        <span className="text-sm font-medium text-white">
          {knocking.length === 1
            ? "Someone wants to join"
            : `${knocking.length} people want to join`}
        </span>
      </div>

      <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto">
        {knocking.map((k) => (
          <li key={k.socketId} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={k.user.avatarUrl ?? undefined} alt="" />
              <AvatarFallback className="bg-white/10 text-xs text-white">
                {(k.user.name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              {k.user.name || "Guest"}
            </span>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onDeny(k.socketId)}
                aria-label={`Don't let ${k.user.name} in`}
                title="Don't let them in"
                className="text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <X className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                onClick={() => onAdmit(k.socketId)}
                aria-label={`Let ${k.user.name} in`}
                title="Let them in"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Check className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {knocking.length > 1 && (
        <div className="border-t border-white/10 p-2">
          <Button
            size="sm"
            onClick={() => onAdmit()}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Check className="size-4" /> Let all {knocking.length} in
          </Button>
        </div>
      )}
    </div>
  );
}
