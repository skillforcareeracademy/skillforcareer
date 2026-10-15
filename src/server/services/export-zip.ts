import { Readable } from "node:stream";
// archiver 8 is pure ESM: no default factory, a `ZipArchive` class instead.
import { ZipArchive } from "archiver";
import { readUpload } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Downloads that carry the files, not only a spreadsheet about them.
 *
 * "Study material, quiz and curriculum export including pdfs and files",
 * "student profile export option including their docs files", and a backup of
 * "everything on LMS". A spreadsheet row that says a PDF exists is no use to
 * someone moving the library somewhere else — they need the PDF.
 *
 * The archive is streamed, never built up in memory and returned in one piece:
 * a serverless response body is capped at 4.5 MB, and a library's worth of PDFs
 * is far past that. `archiver` writes entries as the client pulls them, so the
 * size of the download is bounded only by patience, not by the response limit.
 */

export interface ZipFile {
  /** Where it lands inside the archive, e.g. `Medical Coding/Books/cpt.pdf`. */
  path: string;
  /** A stored upload to pull by its public URL (`/api/files/<...>`)… */
  fileUrl?: string | null;
  /** …or content written straight in (a manifest, a JSON dump, a note). */
  content?: string | Buffer;
}

/** Keep an entry name inside the archive — no leading slash, no `..`, no NUL. */
function safeEntryPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) =>
      seg
        .replace(/[\u0000-\u001f<>:"|?*]/g, "")
        .replace(/^\.+$/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("/");
}

/** The storage key behind a `/api/files/<key>` URL, query string dropped. */
export function storageKeyOf(fileUrl: string): string | null {
  const m = fileUrl.split("?")[0]!.match(/\/api\/files\/(.+)$/);
  return m ? m[1]! : null;
}

/**
 * Stream a ZIP built by `build`. The callback is handed an `add` it calls once
 * per entry; files already in storage are read as they are added, so only one
 * is in memory at a time.
 */
export function streamZip(
  filename: string,
  build: (add: (entry: ZipFile) => Promise<void>) => Promise<void>,
): Response {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  // A missing file must not abort the whole download — note it and carry on.
  archive.on("warning", (err) => logger.warn("zip warning", { err: String(err) }));
  archive.on("error", (err) => logger.error("zip error", { err: String(err) }));

  const used = new Set<string>();
  const add = async (entry: ZipFile): Promise<void> => {
    let name = safeEntryPath(entry.path) || "file";
    // Two materials can share a title; keep the second from overwriting the
    // first inside the archive.
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n += 1;
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);

    if (entry.content != null) {
      archive.append(entry.content, { name });
      return;
    }
    if (entry.fileUrl) {
      const key = storageKeyOf(entry.fileUrl);
      if (!key) return;
      const file = await readUpload(key);
      if (file) archive.append(file.data, { name });
    }
  };

  // Build and finalise off to the side; the Response streams what it produces.
  void (async () => {
    try {
      await build(add);
      await archive.finalize();
    } catch (err) {
      logger.error("zip build failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      archive.abort();
    }
  })();

  const body = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
