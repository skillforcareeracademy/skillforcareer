/**
 * A stable id for "this browser", used to count how many devices a learner has
 * watched a recording on.
 *
 * Be clear about what this is: a **deterrent, not DRM**. It is a random value
 * the browser keeps for itself and volunteers on each request. A learner who
 * wants to get round it can clear their storage, open a private window, or use
 * a different browser — and each of those looks like a new device. What it does
 * buy is the thing the client actually asked for: passing one login around a
 * study group stops being effortless, and an admin can see and prune the list.
 * Anything stronger needs device attestation, which is not on the table here.
 *
 * localStorage first, because it survives a cookie clear in most browsers; a
 * cookie as the fallback, because localStorage throws outright in a locked-down
 * Safari and in some in-app webviews. Both are best-effort, and every access is
 * wrapped — a browser that refuses both still gets a working player, it just
 * looks like a fresh device each time.
 */

const STORAGE_KEY = "sfc.device-id";
const COOKIE_NAME = "sfc_device";
/** Two years. Long enough that a regular learner keeps one device row. */
const COOKIE_MAX_AGE = 63_072_000;

/** The header the browser sends it on. Read server-side by the recording routes. */
export const DEVICE_ID_HEADER = "x-device-id";

function readCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(id: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Keep the cookie in step, so clearing one of the two doesn't cost the
      // learner a device slot.
      try {
        if (!readCookie()) writeCookie(stored);
      } catch {
        /* cookies unavailable — localStorage alone will do */
      }
      return stored;
    }
  } catch {
    /* localStorage unavailable — fall through to the cookie */
  }

  let id: string | null = null;
  try {
    id = readCookie();
  } catch {
    /* no cookies either */
  }

  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    writeCookie(id);
  } catch {
    /* ignore */
  }
  return id;
}
