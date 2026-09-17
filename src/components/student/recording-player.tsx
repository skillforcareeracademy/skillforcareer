"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { DEVICE_ID_HEADER, getDeviceId } from "@/lib/device-id";
import {
  loadRazorpay,
  openRazorpay,
  type CheckoutSession,
} from "@/lib/razorpay-checkout";
import { Button } from "@/components/ui/button";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** What `POST /api/recordings/:id/view` hands back. */
interface ViewSession {
  viewsUsed: number;
  viewsLeft: number | null;
  devicesUsed: number;
  devicesLeft: number | null;
  watermark: boolean;
  watermarkName: string;
  watermarkEmail: string;
  token: string;
  tokenExpiresAt: string;
  sameWatch: boolean;
}

/**
 * The only player for a class recording.
 *
 * It mounts when the learner opens the dialog, not when the page renders — the
 * `POST …/view` it starts with is what spends a watch, so a list of twenty past
 * classes must not spend twenty. From there the element is fed by
 * `/api/recordings/:id/stream`, which is the only address the bytes have.
 *
 * Downloading is discouraged on every lever the platform actually has:
 * `controlsList="nodownload"` drops it from the browser's own menu,
 * `disablePictureInPicture` stops it being popped into a floating window, and
 * the context menu is swallowed so "Save video as…" never appears. None of that
 * is a lock — see the note on the watermark below — it just means a learner has
 * to mean it.
 */
export function RecordingPlayer({
  meetingId,
  watermarkPrice,
  onPaid,
}: {
  meetingId: string;
  /** Null when the admin hasn't put the overlay up for sale. */
  watermarkPrice: number | null;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const [session, setSession] = useState<ViewSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waived, setWaived] = useState(false);
  const [paying, setPaying] = useState(false);

  const deviceRef = useRef<string>("");
  const tokenRef = useRef<string | null>(null);
  /** Wall-clock start of the current stretch of playback, or null when paused. */
  const playingSinceRef = useRef<number | null>(null);
  /**
   * The registration request, kept so a re-run of the effect joins the one
   * already in flight instead of firing a second.
   *
   * React's StrictMode runs this effect twice in development. Two calls went
   * out, and although the server only counted the watch once (the claim is
   * atomic), the reply that arrived last was the staler of the two — the footer
   * could read "5 of 5 views left" immediately after spending one. A plain
   * "already started" flag doesn't fix it either: the first run's cleanup
   * cancels its own handler, and the second run has nothing to wait for, so the
   * player never receives a session at all. Sharing the promise gives both runs
   * the same answer for the price of one request.
   */
  const requestRef = useRef<Promise<ViewSession> | null>(null);

  // ── Start the watch ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const deviceId = getDeviceId();
    deviceRef.current = deviceId;

    requestRef.current ??= api.post<ViewSession>(
      `/api/recordings/${meetingId}/view`,
      {},
      { [DEVICE_ID_HEADER]: deviceId },
    );

    requestRef.current
      .then((s) => {
        if (!alive) return;
        tokenRef.current = s.token;
        setSession(s);
      })
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't start this recording. Try again.",
        );
      });

    return () => {
      alive = false;
    };
  }, [meetingId]);

  /**
   * Report roughly how long was watched. Carries the ticket, which marks the
   * call as the same watch continuing, so a pause or a close never costs a
   * second view however long the learner sat with it open.
   */
  const report = useCallback(
    (seconds: number, onUnmount = false) => {
      const token = tokenRef.current;
      if (!token || seconds <= 0) return;
      const body = JSON.stringify({
        token,
        secondsWatched: Math.round(seconds),
      });
      const headers = {
        "Content-Type": "application/json",
        [DEVICE_ID_HEADER]: deviceRef.current,
      };
      // `keepalive` so the last report survives the dialog closing and the
      // component going away. Fire-and-forget: there is nothing to show.
      void fetch(`/api/recordings/${meetingId}/view`, {
        method: "POST",
        headers,
        body,
        keepalive: onUnmount,
      }).catch(() => {});
    },
    [meetingId],
  );

  const flush = useCallback(
    (onUnmount = false) => {
      const since = playingSinceRef.current;
      playingSinceRef.current = null;
      if (since == null) return;
      report((Date.now() - since) / 1000, onUnmount);
    },
    [report],
  );

  useEffect(() => () => flush(true), [flush]);

  // ── Paying the overlay off ────────────────────────────────────────────────
  async function removeWatermark() {
    setPaying(true);
    try {
      const checkout = await api.post<CheckoutSession>(
        `/api/recordings/${meetingId}/watermark/checkout`,
      );
      if (!checkout.keyId) {
        toast.error(
          "Online payments aren't set up yet. Please contact support.",
        );
        setPaying(false);
        return;
      }
      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("Couldn't load the payment window. Check your connection.");
        setPaying(false);
        return;
      }
      openRazorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "SkillForCareer",
        description: checkout.courseTitle,
        order_id: checkout.orderId,
        prefill: checkout.prefill,
        theme: { color: "#e11d48" },
        handler: async (resp) => {
          try {
            await api.post("/api/payments/verify", {
              paymentId: checkout.paymentId,
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            });
            setWaived(true);
            toast.success(
              "Payment received — the watermark is off this recording.",
            );
          } catch {
            // The webhook still reconciles, so don't call it a failure.
            toast.info(
              "Payment received — the watermark will come off shortly.",
            );
          }
          onPaid?.();
          router.refresh();
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't start the payment.",
      );
      setPaying(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-muted/40 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center">
        <ShieldOff className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">Can&apos;t play this recording</p>
        <p className="text-muted-foreground max-w-sm text-xs">{error}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black">
        <Loader2 className="size-6 animate-spin text-white/70" />
      </div>
    );
  }

  const showWatermark = session.watermark && !waived;
  const forSale = watermarkPrice != null && watermarkPrice > 0 && showWatermark;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          src={`/api/recordings/${meetingId}/stream?t=${encodeURIComponent(session.token)}`}
          controls
          autoPlay
          playsInline
          preload="metadata"
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => {
            playingSinceRef.current = Date.now();
          }}
          onPause={() => flush()}
          onEnded={() => flush()}
          className="aspect-video w-full"
        >
          <track kind="captions" />
        </video>
        {showWatermark && (
          <Watermark
            name={session.watermarkName}
            email={session.watermarkEmail}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {session.viewsLeft == null
            ? "Unlimited views"
            : `${session.viewsLeft} of ${session.viewsUsed + session.viewsLeft} views left`}
          {session.devicesLeft != null &&
            ` · ${session.devicesUsed} of ${session.devicesUsed + session.devicesLeft} devices used`}
        </p>
        {forSale && (
          <Button
            size="sm"
            variant="outline"
            onClick={removeWatermark}
            disabled={paying}
          >
            {paying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Watch without the watermark · {inr(watermarkPrice)}
          </Button>
        )}
      </div>
      {showWatermark && (
        <p className="text-muted-foreground text-xs">
          Your name and email are shown over the video to discourage sharing.
          {forSale ? " Pay once to take it off this recording." : ""}
        </p>
      )}
    </div>
  );
}

/** How often the overlay moves, and how long it takes to get there. */
const DRIFT_EVERY_MS = 6000;
const DRIFT_DURATION_MS = 4500;

/**
 * The "Skill For Career" overlay, with the learner's own name and email under it
 * in small type.
 *
 * It drifts to a new spot every few seconds rather than sitting in a corner,
 * because a fixed corner is the one thing a screen recorder can crop away. It is
 * `pointer-events-none` so it never gets between the learner and the scrubber,
 * and `aria-hidden` so a screen reader doesn't read an email address out every
 * six seconds.
 *
 * Be honest about the ceiling: this is a DOM node over a `<video>`. Anyone who
 * opens devtools can delete it, and no overlay survives a phone pointed at the
 * screen. It raises the cost of casual sharing and makes a leaked copy traceable
 * to one learner, which is what it is for. Burning the mark into the pixels
 * needs server-side transcoding of every upload — a much bigger piece of work,
 * and worth quoting separately if the client wants it.
 */
function Watermark({ name, email }: { name: string; email: string }) {
  const [spot, setSpot] = useState({ top: 10, left: 6 });

  useEffect(() => {
    const move = () =>
      setSpot({
        // Kept inside the frame with room for two lines of text at the bottom
        // and a long email address on the right.
        top: 6 + Math.random() * 76,
        left: 4 + Math.random() * 48,
      });
    const id = setInterval(move, DRIFT_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      <div
        className="absolute max-w-[60%] ease-in-out"
        style={{
          top: `${spot.top}%`,
          left: `${spot.left}%`,
          transition: `top ${DRIFT_DURATION_MS}ms ease-in-out, left ${DRIFT_DURATION_MS}ms ease-in-out`,
        }}
      >
        <p className="text-[11px] leading-tight font-semibold tracking-wide text-white/55 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-xs">
          Skill For Career
        </p>
        <p className="truncate text-[9px] leading-tight text-white/45 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-[10px]">
          {name} · {email}
        </p>
      </div>
    </div>
  );
}
