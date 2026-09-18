import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/**
 * ICE configuration for the live-class rooms, built on the server.
 *
 * Media in a live class is peer-to-peer. Two browsers can only reach each other
 * directly when at least one of them has a route the other can dial; on mobile
 * data, on college Wi-Fi and behind most office firewalls there is no such
 * route, and a STUN-only room simply never connects — the symptom the client
 * reported as "video conferencing mein proper work nahi chal raha hai".
 *
 * A TURN server is the fix: it relays the media when nothing else works. It is
 * configured here rather than in the browser bundle for two reasons —
 * credentials must never ship in client code, and the host can be repointed by
 * changing an environment variable instead of rebuilding the app.
 *
 * Two ways to configure it:
 *
 *   1. Static credentials — TURN_URLS + TURN_USERNAME + TURN_PASSWORD.
 *      Simplest; the same username/password for everyone.
 *
 *   2. coturn's REST API (`use-auth-secret`) — TURN_URLS + TURN_SHARED_SECRET.
 *      Preferred. Each learner gets a credential that expires by itself, so a
 *      leaked one is worthless within the hour and nobody can borrow the
 *      client's relay bandwidth for their own traffic.
 *
 * With neither set the room falls back to public STUN and still works
 * peer-to-peer on a friendly network — no configuration, no hard failure.
 */

/** How long a minted coturn credential stays valid. Longer than any class. */
const TURN_TTL_SECONDS = 6 * 60 * 60;

/** Public STUN, used when nothing is configured. Several, so one outage isn't fatal. */
const FALLBACK_STUN: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ],
  },
];

export interface LiveIceConfig {
  iceServers: RTCIceServer[];
  /** True once a relay is configured — the room says so in its diagnostics. */
  hasTurn: boolean;
  /** Participants a mesh room carries at full video. See NEXT_PUBLIC_LIVE_MESH_LIMIT. */
  meshLimit: number;
}

function urlList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * coturn's shared-secret scheme: the username is the expiry (and, by
 * convention, a name after a colon) and the password is the HMAC-SHA1 of that
 * username under the shared secret, base64-encoded. coturn recomputes the same
 * HMAC, so no credential list has to be kept anywhere.
 */
function restCredentials(secret: string, userId: string) {
  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function buildIceConfig(userId: string): LiveIceConfig {
  const meshLimit = env.NEXT_PUBLIC_LIVE_MESH_LIMIT;

  const turnUrls = urlList(env.TURN_URLS);
  const stunUrls = urlList(env.STUN_URLS);
  const stun: RTCIceServer[] =
    stunUrls.length > 0 ? [{ urls: stunUrls }] : FALLBACK_STUN;

  if (turnUrls.length === 0) {
    return { iceServers: stun, hasTurn: false, meshLimit };
  }

  const sharedSecret = env.TURN_SHARED_SECRET;
  const turn: RTCIceServer = sharedSecret
    ? { urls: turnUrls, ...restCredentials(sharedSecret, userId) }
    : {
        urls: turnUrls,
        username: env.TURN_USERNAME ?? "",
        credential: env.TURN_PASSWORD ?? "",
      };

  // A TURN host answers STUN too, but keep the public servers in the list: they
  // find the direct route first, and a direct route beats a relayed one on both
  // latency and the client's bandwidth bill.
  return { iceServers: [...stun, turn], hasTurn: true, meshLimit };
}
