"use client";

import { useEffect } from "react";

const LAST_PING_KEY = "sfc.signalling-woken-at";
/** The host puts an idle server to sleep after 15 minutes; ping more often than that. */
const PING_EVERY_MS = 10 * 60 * 1000;

/**
 * Wakes the live-class signalling server ahead of time.
 *
 * It runs on a host that sleeps when nobody has used it for a while, and the
 * first connection after that took 52 seconds to answer — a class that seemed
 * stuck on "Connecting…". Every signed-in page pings it on the way in, so by
 * the time someone opens a class and presses Join it is already awake. The
 * ping is fire-and-forget: no response is read and a failure changes nothing.
 */
export function WakeSignalling({ url }: { url: string }) {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(LAST_PING_KEY) ?? 0);
      if (Date.now() - last < PING_EVERY_MS) return;
      sessionStorage.setItem(LAST_PING_KEY, String(Date.now()));
    } catch {
      // Storage blocked: ping anyway, it's one small request.
    }
    void fetch(`${url.replace(/\/$/, "")}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }, [url]);
  return null;
}
