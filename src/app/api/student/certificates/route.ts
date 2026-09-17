import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listStudentCertificates } from "@/server/services/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/certificates — the learner's awarded certificates. */
export const GET = withRoute(async () =>
  ok(await listStudentCertificates((await requireApiUser()).id)),
);
