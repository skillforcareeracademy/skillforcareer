import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import {
  MATERIAL_SAMPLE_KINDS,
  type MaterialSampleKind,
} from "@/lib/validations/study-material";
import {
  exportMaterials,
  materialSampleSheet,
} from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: string | null) => (v && v.trim() ? v.trim() : undefined);

/**
 * The library as a spreadsheet, narrowed to whatever the export dialog asked
 * for — a folder, a course, a cohort, a span of dates, one piece, or the lot —
 * with only the columns ticked.
 *
 * `sample=1` returns the same columns with one example row and nothing else,
 * which is the sheet the academy fills in to import.
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const sp = new URL(req.url).searchParams;

  const columns = sp.get("columns")?.split(",").map((c) => c.trim()).filter(Boolean);

  if (sp.get("sample") === "1") {
    // `?kind=` tailors the example row to the kind of material being written up.
    const asked = sp.get("kind") ?? "mixed";
    const kind = (MATERIAL_SAMPLE_KINDS as readonly string[]).includes(asked)
      ? (asked as MaterialSampleKind)
      : "mixed";
    return csvResponse(
      kind === "mixed" ? "study-material-sample.csv" : `study-material-sample-${kind}.csv`,
      materialSampleSheet(columns, kind),
    );
  }

  const csv = await exportMaterials(
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
  return csvResponse("study-material.csv", csv);
});
