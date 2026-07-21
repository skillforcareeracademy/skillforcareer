import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { searchPublicCourses } from "@/server/services/course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public type-ahead for the header/hero search boxes. No auth: catalog data. */
export const GET = withRoute(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return ok([]);
  return ok(await searchPublicCourses(q, 6));
});
