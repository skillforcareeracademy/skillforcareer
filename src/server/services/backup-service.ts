import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { ZipFile } from "./export-zip";

/**
 * A backup of everything on the LMS — "an option to backup complete database
 * or everything on LMS".
 *
 * `data/<Table>.json` carries every row of every table; `files/` carries every
 * uploaded file, its bytes read one at a time so the whole library is never
 * held in memory at once. The two together are a point-in-time copy that can
 * be read back or handed to another system.
 *
 * It is streamed through `streamZip`, so its size is bounded by the data, not
 * by the 4.5 MB a serverless response may otherwise return.
 */

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  // A table's own bytes (MediaAsset.data) never belong in the JSON — the files
  // go in `files/`. This only catches any stray binary column.
  if (value instanceof Uint8Array) return `<binary ${value.length} bytes>`;
  return value;
}

type Delegate = { findMany: (args?: unknown) => Promise<unknown[]> };

/**
 * Every model on the client, named for its JSON file. Read off the client at
 * runtime rather than the generated DMMF, which this Prisma build does not
 * expose — a model is any property carrying a `findMany`.
 */
function allModels(): { name: string; client: Delegate }[] {
  const out: { name: string; client: Delegate }[] = [];
  for (const key of Object.keys(prisma)) {
    if (key.startsWith("$") || key.startsWith("_")) continue;
    const client = (prisma as unknown as Record<string, unknown>)[key] as
      | Partial<Delegate>
      | undefined;
    if (client && typeof client.findMany === "function") {
      out.push({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        client: client as Delegate,
      });
    }
  }
  return out;
}

/**
 * Yield every entry of the backup in turn. The caller adds each to the archive,
 * so only one table's rows — or one file's bytes — is in hand at a time.
 */
export async function* backupEntries(): AsyncGenerator<ZipFile> {
  const startedAt = new Date().toISOString();
  const models = allModels();

  yield {
    path: "README.txt",
    content:
      `Skill For Career Academy — full LMS backup\n` +
      `Generated: ${startedAt}\n\n` +
      `data/<Table>.json  — every row of every table (${models.length} tables)\n` +
      `files/<id>/<name>  — every uploaded file\n`,
  };

  for (const model of models) {
    try {
      // MediaAsset's bytes are the files below; dump only its metadata here.
      const rows =
        model.name === "MediaAsset"
          ? await prisma.mediaAsset.findMany({
              select: { id: true, mime: true, ext: true, name: true, size: true, createdAt: true },
            })
          : await model.client.findMany();
      yield {
        path: `data/${model.name}.json`,
        content: JSON.stringify(rows, jsonReplacer, 2),
      };
    } catch (err) {
      logger.warn("backup: couldn't dump a table", {
        model: model.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Files, read one at a time by id so the archive never holds them all.
  const assets = await prisma.mediaAsset.findMany({
    select: { id: true, name: true, ext: true },
    orderBy: { createdAt: "asc" },
  });
  for (const a of assets) {
    const full = await prisma.mediaAsset.findUnique({
      where: { id: a.id },
      select: { data: true },
    });
    const data = full?.data;
    if (!data || data.length === 0) continue;
    const name = a.name && a.name.trim() ? a.name : `${a.id}${a.ext ?? ""}`;
    yield { path: `files/${a.id}/${name}`, content: Buffer.from(data) };
  }
}
