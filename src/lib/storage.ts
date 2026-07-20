import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local file storage (STORAGE_DRIVER=local). Files are written under
 * `storage/uploads` and served back through `GET /api/files/[...path]`.
 * Swappable for S3 later without changing call sites.
 */
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/webm": ".webm",
  "video/mp4": ".mp4",
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

export const ACCEPTED_IMAGE_MIME = Object.keys(MIME_TO_EXT);
export const ACCEPTED_VIDEO_MIME = Object.keys(VIDEO_MIME_TO_EXT);

export function extForMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

/** Video/webm|mp4 (possibly with a `;codecs=…` suffix) → extension. */
export function extForVideoMime(mime: string): string | null {
  const base = mime.split(";")[0].trim();
  return VIDEO_MIME_TO_EXT[base] ?? null;
}

export function mimeForPath(filePath: string): string {
  return EXT_TO_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Persist bytes and return a public URL path (`/api/files/<name>`). */
export async function saveUpload(buffer: Buffer, ext: string): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/api/files/${name}`;
}

/** Read a stored file, guarding against path traversal. Returns null if absent. */
export async function readUpload(
  relativePath: string,
): Promise<{ data: Buffer; mime: string } | null> {
  const normalized = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) return null;

  const filePath = path.join(UPLOAD_DIR, normalized);
  if (!filePath.startsWith(UPLOAD_DIR)) return null;

  try {
    const data = await readFile(filePath);
    return { data, mime: mimeForPath(filePath) };
  } catch {
    return null;
  }
}
