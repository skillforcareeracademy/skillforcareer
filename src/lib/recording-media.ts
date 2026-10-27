import { createHmac } from "node:crypto";

/**
 * Off-platform recording storage, on the academy's own VPS.
 *
 * A class recording is far larger than the 4.5 MB a Vercel function can receive
 * or send, so the bytes never pass through the app: the browser uploads the
 * finished recording straight to the VPS media service and plays it straight
 * from there. Every request carries a short-lived token this module signs with
 * the shared secret; the VPS service verifies it the same way.
 *
 * Inert until both env vars are set (`REC_MEDIA_BASE`, `REC_MEDIA_SECRET`), so
 * where it isn't configured the old in-database upload/stream path still runs.
 */

const BASE = (process.env.REC_MEDIA_BASE ?? "").replace(/\/+$/, "");
const SECRET = process.env.REC_MEDIA_SECRET ?? "";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Whether VPS recording storage is switched on for this environment. */
export function mediaConfigured(): boolean {
  return Boolean(BASE && SECRET);
}

/** A recording stored on the VPS, by its canonical (token-less) URL. */
export function isVpsRecordingUrl(url: string | null | undefined): boolean {
  return Boolean(url && BASE && url.startsWith(`${BASE}/rec/`));
}

/** The URL kept on the meeting for a VPS-stored recording — no token. */
export function vpsStoredUrl(meetingId: string): string {
  return `${BASE}/rec/${meetingId}`;
}

function signToken(
  meetingId: string,
  op: "put" | "get",
  ttlSeconds: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(`${meetingId}.${op}.${exp}`);
  const sig = b64url(createHmac("sha256", SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

/** A signed URL the browser can PUT to (upload) or GET from (play). */
export function vpsSignedUrl(
  meetingId: string,
  op: "put" | "get",
  ttlSeconds: number,
): string {
  return `${vpsStoredUrl(meetingId)}?t=${signToken(meetingId, op, ttlSeconds)}`;
}
