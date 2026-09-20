import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireBatchWrite } from "@/lib/auth/api-guard";
import { toCsv, csvResponse } from "@/lib/csv";
import { batchImportSchema } from "@/lib/validations/batch-profile";
import {
  batchImportTemplate,
  importBatchStudents,
} from "@/server/services/batch-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the template sheet (`name,email,phone`) with one sample row. */
export const GET = withRoute(async (_req, { params }) => {
  await requireBatchWrite(String((await params).id));
  const { headers, data } = batchImportTemplate();
  return csvResponse("batch-students-template.csv", toCsv(headers, data));
});

/**
 * POST — load learners onto the batch from a CSV. Every row comes back with a
 * result (added / created / skipped + why) instead of one bad row failing the
 * whole file.
 */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const { csv } = batchImportSchema.parse(await req.json().catch(() => ({})));
  const result = await importBatchStudents(id, csv);
  const parts = [`${result.added} added`];
  if (result.created)
    parts.push(
      `${result.created} new account${result.created === 1 ? "" : "s"}`,
    );
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  return created({ ...result, message: `${parts.join(" · ")}.` });
});
