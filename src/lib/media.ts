/**
 * Turning the links instructors actually paste into something a browser will
 * render inline.
 *
 * Course material rarely arrives as a bare .mp4 — it is a Google Drive share
 * link, a YouTube video, a Sheet, or a PDF sitting on our own /api/files. Each
 * needs a different embed URL, and a Drive "view" link in particular renders
 * nothing at all unless it is rewritten to /preview.
 *
 * This is the one place that knows how: the lesson player, the course preview
 * and the in-app link viewer all resolve through it, so a link behaves the same
 * wherever the academy pastes it. Nothing here fetches anything — it is pure
 * URL rewriting, safe to call while rendering.
 */

export type EmbedKind =
  "video-file" | "audio-file" | "image" | "iframe" | "pdf" | "link";

export interface Embed {
  kind: EmbedKind;
  /** What to point the <video>/<iframe>/<img> at. */
  src: string;
  /** Where "open in a new tab" should go — always the original link. */
  href: string;
  /** A short noun for a heading or a button: "Video", "Spreadsheet", … */
  label: string;
  /**
   * Whether the destination is known to allow being framed. A page we only
   * guessed at may answer with X-Frame-Options and come up blank, so the
   * viewer keeps the way out in front of the reader rather than hiding it.
   */
  trusted: boolean;
}

const YOUTUBE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/i;
const DRIVE_FILE = /drive\.google\.com\/file\/d\/([\w-]+)/i;
const DRIVE_OPEN = /drive\.google\.com\/open\?id=([\w-]+)/i;
const DOCS =
  /docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/(?:e\/)?([\w-]+)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|oga)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const OFFICE_EXT = /\.(docx?|pptx?|xlsx?|csv)(\?|#|$)/i;

/** Whether a URL is one we serve ourselves — same origin, always frameable. */
function isLocal(url: string): boolean {
  return url.startsWith("/");
}

/** Google Docs names its own viewer differently per kind. */
function docsEmbed(kind: string, id: string): { src: string; label: string } {
  const base = `https://docs.google.com/${kind}/d/${id}`;
  switch (kind) {
    case "presentation":
      return { src: `${base}/embed?start=false&loop=false`, label: "Slides" };
    case "spreadsheets":
      return { src: `${base}/preview`, label: "Spreadsheet" };
    case "forms":
      return { src: `${base}/viewform?embedded=true`, label: "Form" };
    default:
      return { src: `${base}/preview`, label: "Document" };
  }
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
      label: "Video",
      trusted: true,
    };
  }

  const vimeo = raw.match(VIMEO);
  if (vimeo) {
    return {
      kind: "iframe",
      src: `https://player.vimeo.com/video/${vimeo[1]}`,
      href: raw,
      label: "Video",
      trusted: true,
    };
  }

  // Google Drive only renders inside an iframe via /preview — the /view link
  // people copy out of the share dialog shows a blank frame.
  const drive = raw.match(DRIVE_FILE) ?? raw.match(DRIVE_OPEN);
  if (drive) {
    return {
      kind: "iframe",
      src: `https://drive.google.com/file/d/${drive[1]}/preview`,
      href: raw,
      label: "File",
      trusted: true,
    };
  }

  const docs = raw.match(DOCS);
  if (docs) {
    const { src, label } = docsEmbed(docs[1], docs[2]);
    return { kind: "iframe", src, href: raw, label, trusted: true };
  }

  if (VIDEO_EXT.test(raw)) {
    return {
      kind: "video-file",
      src: raw,
      href: raw,
      label: "Video",
      trusted: true,
    };
  }
  if (AUDIO_EXT.test(raw)) {
    return {
      kind: "audio-file",
      src: raw,
      href: raw,
      label: "Audio",
      trusted: true,
    };
  }
  if (IMAGE_EXT.test(raw)) {
    return {
      kind: "image",
      src: raw,
      href: raw,
      label: "Image",
      trusted: true,
    };
  }
  if (PDF_EXT.test(raw)) {
    return { kind: "pdf", src: raw, href: raw, label: "PDF", trusted: true };
  }

  // Office documents have no viewer of their own. Microsoft's renders any
  // publicly reachable one; ours sit behind a login, so sending it there would
  // only show the sign-in page — those go to the browser's own handling.
  if (OFFICE_EXT.test(raw)) {
    if (isLocal(raw)) {
      return {
        kind: "iframe",
        src: raw,
        href: raw,
        label: "Document",
        trusted: true,
      };
    }
    return {
      kind: "iframe",
      src: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(raw)}`,
      href: raw,
      label: "Document",
      trusted: true,
    };
  }

  // An /api/files upload with no telling extension is still ours to serve.
  if (isLocal(raw)) {
    return {
      kind: "iframe",
      src: raw,
      href: raw,
      label: "File",
      trusted: true,
    };
  }

  // Anything else is an ordinary web page. Worth *trying* in a frame — that is
  // what the in-app viewer does — but plenty of sites refuse, so it stays
  // `link` and the places that need a sure thing (the lesson player, the course
  // preview) keep offering the new tab instead of showing an empty box.
  return { kind: "link", src: raw, href: raw, label: "Link", trusted: false };
}

/** A human label for the "open" affordance next to an embed. */
export function embedLabel(embed: Embed): string {
  switch (embed.kind) {
    case "pdf":
      return "Open PDF";
    case "video-file":
      return "Open video";
    case "audio-file":
      return "Open audio";
    case "image":
      return "Open image";
    default:
      return "Open in new tab";
  }
}
