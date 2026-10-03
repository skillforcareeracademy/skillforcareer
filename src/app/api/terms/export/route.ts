import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { TERM_KINDS, type TermKind } from "@/lib/validations/term";
import { exportTerms, termSampleSheet } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The dictionary as a sheet; `sample=1` for a blank one to fill in. */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const sp = new URL(req.url).searchParams;
  if (sp.get("sample") === "1") {
    const asked = sp.get("kind") ?? "";
    const kind = (TERM_KINDS as readonly string[]).includes(asked)
      ? (asked as TermKind)
      : undefined;
    return csvResponse(
      kind ? `terminology-sample-${kind.toLowerCase()}.csv` : "terminology-sample.csv",
      termSampleSheet(kind),
    );
  }
  return csvResponse("terminology.csv", await exportTerms());
});
