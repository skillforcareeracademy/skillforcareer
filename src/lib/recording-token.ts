import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * A short-lived ticket that says "this learner, on this device, has spent a
 * view of this recording and may fetch its bytes".
 *
 * Why a ticket at all: a `<video>` element seeks by issuing a fresh HTTP Range
 * request for every scrub, so the stream route is hit many times for one watch.
 * Re-running the full permission check on each of those — audience rows, window,
 * view count, device count — is four queries against a database a region away,
 * and it also makes the view limit bite in the wrong place: the learner spending
 * their fifth and last view would be refused the moment they dragged the
 * scrubber, because by then `viewCount` has already reached the cap.
 *
 * So the expensive check happens once, in `POST /api/recordings/:id/view`, which
 * hands back one of these. The stream route then only verifies the signature and
 * the still-cheap things it has to load anyway (is the recording still published,
 * is the window still open). A ticket is worthless to anyone else: the stream
 * route also requires a live session and refuses unless the session's user is the
 * one named inside.
 *
 * Signed with a key derived from JWT_ACCESS_SECRET under a fixed label, so a
 * playback ticket can never be mistaken for — or forged from — a session token.
 */

/** Long enough to watch a three-hour class and scrub back through it. */
const TTL_MS = 4 * 60 * 60 * 1000;

function signingKey(): Buffer {
  return createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update("recording-playback-v1")
    .digest();
}

export interface PlaybackClaims {
  meetingId: string;
  userId: string;
  deviceId: string;
  /** When the ticket stops working, ISO — handy for the player to show. */
  expiresAt: string;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function issuePlaybackToken(claims: Omit<PlaybackClaims, "expiresAt">): {
  token: string;
  expiresAt: string;
} {
  const expiry = Date.now() + TTL_MS;
  // Ids are cuids and the device id is a UUID, so none of them can contain the
  // separator — no escaping needed.
  const body = Buffer.from(
    [claims.meetingId, claims.userId, claims.deviceId, expiry].join("|"),
    "utf8",
  ).toString("base64url");
  return {
    token: `${body}.${sign(body)}`,
    expiresAt: new Date(expiry).toISOString(),
  };
}

/** Claims from a ticket, or null if it is malformed, forged or expired. */
export function readPlaybackToken(token: string): PlaybackClaims | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = Buffer.from(sign(body), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;

  const parts = Buffer.from(body, "base64url").toString("utf8").split("|");
  if (parts.length !== 4) return null;
  const [meetingId, userId, deviceId, expiry] = parts;
  if (!meetingId || !userId || !deviceId) return null;
  const expiryMs = Number(expiry);
  if (!expiryMs || expiryMs < Date.now()) return null;

  return {
    meetingId,
    userId,
    deviceId,
    expiresAt: new Date(expiryMs).toISOString(),
  };
}
