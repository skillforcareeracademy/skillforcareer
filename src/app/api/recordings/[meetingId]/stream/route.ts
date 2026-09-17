import { getSessionUser } from "@/lib/auth/api-guard";
import { readUpload, storageKeyFromUrl } from "@/lib/storage";
import { readPlaybackToken } from "@/lib/recording-token";
import { loadRecordingForUser } from "@/server/services/recording-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recordings/:meetingId/stream — the only way to the bytes of a class
 * recording.
 *
 * Replaces handing learners `Meeting.recordingUrl`, which was a plain, guessable
 * `/api/files/...` address that anyone could fetch, keep or forward. Nothing
 * learner-facing carries that URL any more; this route resolves the session,
 * checks the grant, and serves the file itself.
 *
 * Every refusal is the same bare 403, deliberately: a probe should not be able to
 * tell "not signed in" from "not in the audience" from "your window closed", and
 * this is a media endpoint rather than a JSON API, so there is no envelope to put
 * a code in. The learner already has the real reason — the page that offered them
 * the player got it from `resolveRecordingState`.
 *
 * `Content-Disposition: inline` and `Cache-Control: private, no-store` are the
 * download half of the ask ("recording download nahi kar sakta"): the browser is
 * told to play it, not to keep it, and no shared cache may hold a copy. Range
 * support is not optional — a `<video>` seeks by asking for byte ranges, and a
 * server that ignores them gives you a scrubber that does nothing.
 */

const DENY = () =>
  new Response("Forbidden", {
    status: 403,
    headers: { "Cache-Control": "private, no-store" },
  });

/** `bytes=0-499` / `bytes=500-` / `bytes=-500` → absolute offsets. */
function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // A suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  // Clamp rather than reject: browsers routinely ask past the end of a file.
  end = Math.min(end, size - 1);
  if (start > end || start >= size || start < 0) return null;
  return { start, end };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  const user = await getSessionUser();
  if (!user) return DENY();

  let loaded;
  try {
    loaded = await loadRecordingForUser(user, meetingId);
  } catch {
    return DENY();
  }
  const { meeting, staff, state } = loaded;
  if (!meeting.recordingUrl) return DENY();

  if (!staff) {
    // The ticket proves a view was spent for this learner on this device; see
    // lib/recording-token.ts for why the heavy checks don't run per request.
    const token = new URL(req.url).searchParams.get("t");
    const claims = token ? readPlaybackToken(token) : null;
    if (!claims || claims.meetingId !== meetingId || claims.userId !== user.id)
      return DENY();
    // Still cheap to confirm, because the meeting row is already loaded: an
    // admin who unpublishes a recording, or a window that closes, takes effect
    // without waiting for the ticket to run out.
    if (!state.available) return DENY();
    if (state.reason === "EXPIRED") return DENY();
  }

  const key = storageKeyFromUrl(meeting.recordingUrl);
  if (!key) return DENY();
  const file = await readUpload(key);
  if (!file) return new Response("Not found", { status: 404 });

  const size = file.data.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    // Ranges are what make the scrubber work.
    "Accept-Ranges": "bytes",
    // Play it; don't save it. Not a lock — see the report — but it stops the
    // browser's own "Download" affordance from offering the file.
    "Content-Disposition": "inline",
    // A learner's recording must never sit in a proxy or a shared CDN cache.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    return new Response(new Uint8Array(file.data), {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const range = parseRange(rangeHeader, size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  }

  const { start, end } = range;
  return new Response(new Uint8Array(file.data.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
