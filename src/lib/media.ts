/**
 * Turning the links instructors actually paste into something a browser will
 * render inline.
 *
 * Course material rarely arrives as a bare .mp4 — it is a Google Drive share
 * link, a YouTube video, or a PDF sitting on our own /api/files. Each needs a
 * different embed URL, and a Drive "view" link in particular renders nothing at
 * all unless it is rewritten to /preview.
 */

export type EmbedKind = "video-file" | "iframe" | "pdf" | "link";

export interface Embed {
  kind: EmbedKind;
  /** What to point the <video>/<iframe>/<object> at. */
  src: string;
  /** Where "open in a new tab" should go — always the original link. */
  href: string;
}

const YOUTUBE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/i;
const DRIVE_FILE = /drive\.google\.com\/file\/d\/([\w-]+)/i;
const DRIVE_OPEN = /drive\.google\.com\/open\?id=([\w-]+)/i;
const DOCS = /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const OFFICE_EXT = /\.(docx?|pptx?|xlsx?)(\?|#|$)/i;

/** Whether a URL is same-origin-ish (an upload we serve ourselves). */
function isLocal(url: string): boolean {
  return url.startsWith("/");
}

/**
 * Work out how to show `url` inline. Returns `link` when nothing can be
 * embedded, so the caller can fall back to a plain "open" button rather than
 * an empty frame.
 */
export function resolveEmbed(url: string | null | undefined): Embed | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  const yt = raw.match(YOUTUBE);
  if (yt) {
    return {
      kind: "iframe",
      src: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`,
      href: raw,
    };
  }

  const vimeo = raw.match(VIMEO);
  if (vimeo) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}`, href: raw };
  }

  // Google Drive only renders inside an iframe via /preview — the /view link
  // people copy out of the share dialog shows a blank frame.
  const drive = raw.match(DRIVE_FILE) ?? raw.match(DRIVE_OPEN);
  if (drive) {
    return {
      kind: "iframe",
      src: `https://drive.google.com/file/d/${drive[1]}/preview`,
      href: raw,
    };
  }

  const docs = raw.match(DOCS);
  if (docs) {
    return {
      kind: "iframe",
      src: `https://docs.google.com/${docs[1]}/d/${docs[2]}/preview`,
      href: raw,
    };
  }

  if (VIDEO_EXT.test(raw)) return { kind: "video-file", src: raw, href: raw };
  if (PDF_EXT.test(raw)) return { kind: "pdf", src: raw, href: raw };

  // Office documents have no native browser viewer; Google's renders any
  // publicly reachable one. Our own uploads aren't public, so don't pretend.
  if (OFFICE_EXT.test(raw) && !isLocal(raw)) {
    return {
      kind: "iframe",
      src: `https://docs.google.com/viewer?embedded=1&url=${encodeURIComponent(raw)}`,
      href: raw,
    };
  }

  // An /api/files upload with no telling extension is still ours to serve.
  if (isLocal(raw)) return { kind: "iframe", src: raw, href: raw };

  return { kind: "link", src: raw, href: raw };
}

/** A human label for the "open" affordance next to an embed. */
export function embedLabel(embed: Embed): string {
  switch (embed.kind) {
    case "pdf":
      return "Open PDF";
    case "video-file":
      return "Open video";
    default:
      return "Open in new tab";
  }
}
