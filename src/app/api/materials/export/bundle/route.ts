import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { materialsForBundle } from "@/server/services/study-material-service";
import { streamZip } from "@/server/services/export-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A library's worth of PDFs can take a while to gather and stream.
export const maxDuration = 300;

const str = (v: string | null) => (v && v.trim() ? v.trim() : undefined);

/** A document name that is safe to put in a folder, kept short. */
function docName(fallback: string, name: string | null, url: string): string {
  const fromUrl = url.split("?")[0]!.split("/").pop() ?? "";
  const base = (name && name.trim()) || fromUrl || fallback;
  return base.replace(/[\/\\]/g, "-").slice(0, 120);
}

/**
 * The library as a ZIP that carries the actual files — a manifest spreadsheet
 * at the root, and every piece's PDFs and documents filed under the same folder
 * tree the academy uses. "Study material … export including pdfs and files."
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const sp = new URL(req.url).searchParams;
  const columns = sp.get("columns")?.split(",").map((c) => c.trim()).filter(Boolean);

  const { csv, rows } = await materialsForBundle(
    {
      columns,
      search: str(sp.get("search")),
      groupId: str(sp.get("group")),
      courseId: str(sp.get("course")),
      batchId: str(sp.get("batch")),
      createdFrom: str(sp.get("from")),
      createdTo: str(sp.get("to")),
      ids: sp.get("ids")?.split(",").map((i) => i.trim()).filter(Boolean),
      published:
        sp.get("status") === "yes" ? "yes" : sp.get("status") === "no" ? "no" : undefined,
      sort: "sequence",
    },
    staff ? undefined : user.id,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return streamZip(`study-material-${stamp}.zip`, async (add) => {
    await add({ path: "study-material.csv", content: csv });

    for (const m of rows) {
      // Where this piece sits in the tree, then a folder of its own so its
      // documents don't collide with a neighbour's.
      const folder = (m.groupPaths[0] ?? "Ungrouped").replace(/ → /g, "/");
      const dir = `${folder}/${String(m.number).padStart(3, "0")} ${m.title}`;

      if (m.fileUrl) {
        await add({
          path: `${dir}/${docName("document", m.fileName, m.fileUrl)}`,
          fileUrl: m.fileUrl,
        });
      }
      for (const a of m.assets) {
        // A link is an address, not a file to carry.
        if (a.kind === "LINK" || !a.url.startsWith("/api/files/")) continue;
        await add({
          path: `${dir}/${docName("attachment", a.name, a.url)}`,
          fileUrl: a.url,
        });
      }
    }
  });
});
