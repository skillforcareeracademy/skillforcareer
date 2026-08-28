import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";

/**
 * The media library.
 *
 * Every upload the platform accepts is catalogued here, whichever screen it came
 * from and whichever storage driver holds the bytes. The client asked for one
 * place to put images and copy a path out of — before this, a picture uploaded
 * for a testimonial existed only as a URL inside that one section's JSON, so
 * reusing it anywhere else meant uploading it again.
 */

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  alt: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListMediaQuery {
  search?: string;
  /** "image" | "doc" | undefined for everything. */
  kind?: string;
  page?: number;
  pageSize?: number;
}

const MAX_PAGE_SIZE = 100;

function toItem(row: {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  alt: string | null;
  createdAt: Date;
  uploadedBy: { name: string } | null;
}): MediaItem {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    mime: row.mime,
    size: row.size,
    alt: row.alt,
    uploadedBy: row.uploadedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  url: true,
  name: true,
  mime: true,
  size: true,
  alt: true,
  createdAt: true,
  uploadedBy: { select: { name: true } },
} satisfies Prisma.MediaFileSelect;

export async function listMedia(q: ListMediaQuery = {}): Promise<MediaPage> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, q.pageSize ?? 40));

  const and: Prisma.MediaFileWhereInput[] = [];
  if (q.search?.trim()) {
    const term = q.search.trim();
    and.push({ OR: [{ name: { contains: term } }, { alt: { contains: term } }] });
  }
  if (q.kind === "image") and.push({ mime: { startsWith: "image/" } });
  if (q.kind === "doc") and.push({ NOT: { mime: { startsWith: "image/" } } });

  const where: Prisma.MediaFileWhereInput = and.length ? { AND: and } : {};

  const [rows, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: SELECT,
    }),
    prisma.mediaFile.count({ where }),
  ]);

  return { items: rows.map(toItem), total, page, pageSize };
}

/**
 * Record an upload in the library.
 *
 * Called from the one upload endpoint, so nothing can be stored without being
 * findable afterwards. It never throws into the caller's path: failing to index
 * a file is not a reason to fail the upload the admin actually asked for.
 */
export async function recordUpload(input: {
  url: string;
  name: string;
  mime: string;
  size: number;
  uploadedById?: string | null;
}): Promise<void> {
  try {
    await prisma.mediaFile.create({
      data: {
        url: input.url,
        name: input.name || "file",
        mime: input.mime || "application/octet-stream",
        size: input.size,
        uploadedById: input.uploadedById ?? null,
      },
    });
  } catch (e) {
    console.error("[media] could not index an upload", e);
  }
}

/** Rename a file's label — the caption an admin searches by. */
export async function updateMedia(id: string, alt: string): Promise<MediaItem> {
  const row = await prisma.mediaFile
    .update({ where: { id }, data: { alt: alt.trim() || null }, select: SELECT })
    .catch(() => null);
  if (!row) throw AppError.notFound("That file is no longer in the library.");
  return toItem(row);
}

/**
 * Remove a file from the library.
 *
 * The bytes go too when they live in `MediaAsset` (the `db` driver). Disk and
 * S3 objects are left where they are — the library row is the index, and an
 * orphaned object is cheaper than a broken image on a page nobody checked.
 */
export async function deleteMedia(id: string): Promise<void> {
  const row = await prisma.mediaFile.findUnique({ where: { id }, select: { url: true } });
  if (!row) throw AppError.notFound("That file is no longer in the library.");

  const assetId = assetIdFromUrl(row.url);
  await prisma.mediaFile.delete({ where: { id } });
  if (assetId) {
    await prisma.mediaAsset.delete({ where: { id: assetId } }).catch(() => null);
  }
}

/** `/api/files/<assetId>/<name>` → `<assetId>`, or null for a disk/S3 path. */
function assetIdFromUrl(url: string): string | null {
  const match = /^\/api\/files\/([^/]+)\//.exec(url);
  if (!match) return null;
  // Disk keys are a UUID directory (with dashes); db keys are a cuid.
  const id = match[1];
  return id.includes("-") ? null : id;
}

/**
 * Backfill the library from the bytes table.
 *
 * Uploads made before the library existed have a `MediaAsset` row but no index
 * entry, so the client's Media page would open empty on a site that already has
 * images. Idempotent — anything already indexed is left alone.
 */
export async function backfillMediaLibrary(): Promise<number> {
  const [assets, existing] = await Promise.all([
    prisma.mediaAsset.findMany({
      select: { id: true, name: true, ext: true, mime: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.mediaFile.findMany({ select: { url: true } }),
  ]);

  const known = new Set(existing.map((e) => e.url));
  const missing = assets
    .map((a) => {
      const name = a.name ?? `file${a.ext}`;
      return {
        url: `/api/files/${a.id}/${encodeURIComponent(name)}`,
        name,
        mime: a.mime,
        size: a.size,
        createdAt: a.createdAt,
      };
    })
    .filter((a) => !known.has(a.url));

  if (missing.length === 0) return 0;
  const result = await prisma.mediaFile.createMany({ data: missing });
  return result.count;
}
