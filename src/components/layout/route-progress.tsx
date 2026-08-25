"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The thin loading bar across the top of every page.
 *
 * Most of this site renders dynamically against a database in another region,
 * so a click can sit for a second or two with nothing on screen to say it
 * landed. `loading.tsx` covers a segment once React starts streaming it, but
 * not the gap before that — this fills the gap.
 *
 * It watches document clicks rather than router events (the App Router exposes
 * none) and finishes once the pathname or query actually changes.
 */

/** Where the bar creeps to while waiting, so it never looks finished early. */
const CEILING = 0.9;
const TICK_MS = 200;
/** Below this, a navigation is quick enough that a flash of bar is just noise. */
const SHOW_AFTER_MS = 120;
/** How long the full bar lingers before fading out. */
const SETTLE_MS = 250;

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  /**
   * `start` / `finish` live in a ref so the click listener and the
   * navigation-finished effect drive the same timers without either of them
   * re-subscribing on every render.
   */
  const control = useRef<{ start: () => void; finish: () => void } | null>(null);

  useEffect(() => {
    let creep: number | undefined;
    let show: number | undefined;
    let hide: number | undefined;
    let running = false;

    function clearTimers() {
      if (creep) window.clearInterval(creep);
      if (show) window.clearTimeout(show);
      if (hide) window.clearTimeout(hide);
      creep = show = hide = undefined;
    }

    function start() {
      clearTimers();
      running = true;
      setProgress(0.08);
      show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      creep = window.setInterval(() => {
        // Ease towards the ceiling — quick at first, then barely moving, so a
        // slow page still reads as making progress without ever hitting 100%.
        setProgress((p) => (p >= CEILING ? p : p + (CEILING - p) * 0.12));
      }, TICK_MS);
    }

    function finish() {
      if (!running) return;
      running = false;
      clearTimers();
      setProgress(1);
      hide = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, SETTLE_MS);
    }

    control.current = { start, finish };

    function onClick(event: MouseEvent) {
      // Leave modified clicks and non-primary buttons to the browser.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page, or only a hash change — nothing is going to load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      start();
    }

    window.addEventListener("click", onClick, { capture: true });
    // Back / forward swaps the page out from under the reader too.
    window.addEventListener("popstate", start);
    return () => {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", start);
      control.current = null;
      clearTimers();
    };
  }, []);

  // The destination has rendered — the URL only changes once it has. Deferred
  // by a frame so this never sets state during the effect itself.
  useEffect(() => {
    const id = window.setTimeout(() => control.current?.finish(), 0);
    return () => window.clearTimeout(id);
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="from-primary h-full bg-gradient-to-r to-rose-400"
        style={{
          width: `${Math.round(progress * 100)}%`,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
