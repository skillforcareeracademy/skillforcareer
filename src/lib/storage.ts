import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Upload storage, behind one interface with three interchangeable drivers
 * (STORAGE_DRIVER). Call sites only ever see `saveUpload` / `readUpload`.
 *
 *   local — writes under STORAGE_LOCAL_DIR. Needs a writable, persistent disk,
 *           so it suits local development and self-hosted VPS deploys only.
 *   db    — bytes live in the MediaAsset table. The default on serverless
 *           (Vercel), whose filesystem is read-only apart from /tmp and is
 *           thrown away between requests, which made every upload fail.
 *   s3    — any S3-compatible bucket (AWS, Cloudflare R2, Backblaze B2, MinIO).
 *           The right home for large media such as class recordings.
 *
 * Both `saveUpload` and `readUpload` speak URL paths of the form
 * `/api/files/<name>`, served by GET /api/files/[...path].
 */

const LOCAL_DIR = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

/**
 * Ceiling for the `db` driver. Images cap at 5 MB (UPLOAD.MAX_IMAGE_BYTES), so
 * this leaves headroom while keeping rows well inside TiDB's transaction size
 * limit. Class recordings are far larger and need STORAGE_DRIVER=s3.
 */
const DB_MAX_BYTES = 8 * 1024 * 1024;

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

/**
 * Course material an instructor attaches to a lesson. Kept apart from images so
 * the avatar/thumbnail pickers can't be talked into storing a .zip.
 */
const DOC_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "application/zip": ".zip",
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
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

export const ACCEPTED_IMAGE_MIME = Object.keys(MIME_TO_EXT);
export const ACCEPTED_VIDEO_MIME = Object.keys(VIDEO_MIME_TO_EXT);
export const ACCEPTED_DOC_MIME = Object.keys(DOC_MIME_TO_EXT);

export function extForMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

/** PDF / Office / text / zip mime → extension. */
export function extForDocMime(mime: string): string | null {
  return DOC_MIME_TO_EXT[mime.split(";")[0].trim()] ?? null;
}

/** Video/webm|mp4 (possibly with a `;codecs=…` suffix) → extension. */
export function extForVideoMime(mime: string): string | null {
  const base = mime.split(";")[0].trim();
  return VIDEO_MIME_TO_EXT[base] ?? null;
}

export function mimeForPath(filePath: string): string {
  return mimeForExt(path.extname(filePath));
}

/**
 * `.png` → `image/png`. Kept separate from `mimeForPath` because
 * `path.extname(".png")` is `""` — a leading dot reads as a dotfile with no
 * extension — so a bare extension must not be routed through it.
 */
export function mimeForExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export type StoredFile = { data: Buffer; mime: string; name?: string };

let warnedAboutLocal = false;

/**
 * The driver actually in force. `local` cannot work on serverless — there is no
 * persistent writable disk — so an explicit STORAGE_DRIVER=local left over in a
 * Vercel project would break every upload. Fall back to `db` and say so once,
 * rather than failing each request.
 */
function activeDriver(): "local" | "db" | "s3" {
  if (env.STORAGE_DRIVER === "local" && process.env.VERCEL) {
    if (!warnedAboutLocal) {
      warnedAboutLocal = true;
      console.warn(
        "[storage] STORAGE_DRIVER=local cannot work on Vercel (read-only filesystem) — using the db driver instead.",
      );
    }
    return "db";
  }
  return env.STORAGE_DRIVER;
}

/**
 * Reduce an uploaded file's own name to something safe to put in a URL, while
 * still being recognisably the file the user picked — admins asked to see
 * `medical-coding-brochure.pdf` in the address, not a bare id.
 */
export function safeFileName(originalName: string | undefined, ext: string): string {
  const base = (originalName ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext}`;
}

/**
 * Persist bytes and return a public URL path.
 *
 * The key is `<id>/<original-name><ext>`: the id keeps two uploads of
 * `notes.pdf` from colliding, while the second segment keeps the learner-facing
 * URL — and the browser's download name — the same as the file that was picked.
 */
export async function saveUpload(
  buffer: Buffer,
  ext: string,
  originalName?: string,
): Promise<string> {
  const name = safeFileName(originalName, ext);
  switch (activeDriver()) {
    case "db":
      return saveToDb(buffer, ext, name);
    case "s3":
      return saveToS3(buffer, ext, name);
    default:
      return saveToDisk(buffer, ext, name);
  }
}

/** Read a stored file, guarding against path traversal. Returns null if absent. */
export async function readUpload(relativePath: string): Promise<StoredFile | null> {
  const name = safeName(relativePath);
  if (name === null) return null;

  switch (activeDriver()) {
    case "db":
      return readFromDb(name);
    case "s3":
      return readFromS3(name);
    default:
      return readFromDisk(name);
  }
}

/**
 * Reduce a caller-supplied path to a safe relative name, rejecting anything
 * that tries to escape the storage root.
 */
function safeName(relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) return null;
  return normalized;
}

// ── local ────────────────────────────────────────────────────────────────────

async function saveToDisk(buffer: Buffer, ext: string, name: string): Promise<string> {
  const dir = randomUUID();
  await mkdir(path.join(LOCAL_DIR, dir), { recursive: true });
  await writeFile(path.join(LOCAL_DIR, dir, name), buffer);
  return `/api/files/${dir}/${encodeURIComponent(name)}`;
}

async function readFromDisk(name: string): Promise<StoredFile | null> {
  const filePath = path.join(LOCAL_DIR, name);
  if (!filePath.startsWith(LOCAL_DIR)) return null;

  try {
    const data = await readFile(filePath);
    return { data, mime: mimeForPath(filePath), name: path.basename(filePath) };
  } catch {
    return null;
  }
}

// ── db ───────────────────────────────────────────────────────────────────────

async function saveToDb(buffer: Buffer, ext: string, name: string): Promise<string> {
  if (buffer.byteLength > DB_MAX_BYTES) {
    throw AppError.badRequest(
      "This file is too large for database storage. Configure STORAGE_DRIVER=s3 to upload media this size.",
    );
  }
  const asset = await prisma.mediaAsset.create({
    data: {
      mime: mimeForExt(ext),
      ext,
      name,
      size: buffer.byteLength,
      // Prisma's Bytes field wants a Uint8Array backed by a plain ArrayBuffer;
      // a Node Buffer may sit on a SharedArrayBuffer, so copy it across.
      data: new Uint8Array(buffer),
    },
    select: { id: true },
  });
  return `/api/files/${asset.id}/${encodeURIComponent(name)}`;
}

async function readFromDb(key: string): Promise<StoredFile | null> {
  // New keys are `<id>/<name><ext>`; ones stored before filenames were kept are
  // a bare `<id><ext>`. Both start with the id, so read it off the first segment.
  const first = key.split("/")[0];
  const id = path.basename(first, path.extname(first));
  if (!id) return null;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { data: true, mime: true, name: true },
  });
  if (!asset) return null;

  return {
    data: Buffer.from(asset.data),
    mime: asset.mime,
    name: asset.name ?? path.basename(key),
  };
}

// ── s3 ───────────────────────────────────────────────────────────────────────

async function saveToS3(buffer: Buffer, ext: string, name: string): Promise<string> {
  const key = `${randomUUID()}/${name}`;
  const mime = mimeForExt(ext);

  const res = await s3Request("PUT", key, buffer, mime);
  if (!res.ok) {
    throw AppError.internal(`Object storage rejected the upload (${res.status}).`);
  }

  const publicBase = env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const urlKey = key.split("/").map(encodeURIComponent).join("/");
  return publicBase ? `${publicBase}/${urlKey}` : `/api/files/${urlKey}`;
}

async function readFromS3(name: string): Promise<StoredFile | null> {
  const res = await s3Request("GET", name);
  if (!res.ok) return null;

  const data = Buffer.from(await res.arrayBuffer());
  return {
    data,
    mime: res.headers.get("content-type") ?? mimeForPath(name),
    name: path.basename(name),
  };
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * Issue an AWS Signature Version 4 signed request against the configured
 * bucket. Hand-rolled rather than pulling in an SDK: it is ~40 lines, keeps the
 * serverless bundle small, and works against any S3-compatible endpoint.
 */
async function s3Request(
  method: "PUT" | "GET",
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const { S3_BUCKET: bucket, S3_REGION: region } = env;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw AppError.internal(
      "STORAGE_DRIVER=s3 but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set.",
    );
  }

  // Path-style against a custom endpoint (R2, B2, MinIO); virtual-host on AWS.
  const url = env.S3_ENDPOINT
    ? new URL(`${env.S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}`)
    : new URL(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? "");

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalHeaders = names.map((h) => `${h}:${headers[h].trim()}\n`).join("");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    body: body ? new Uint8Array(body) : undefined,
    headers,
  });
}
