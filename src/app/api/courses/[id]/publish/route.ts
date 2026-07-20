import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireCourseWrite } from "@/lib/auth/api-guard";
import { setCoursePublished } from "@/server/services/course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ publish: z.boolean() });

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireCourseWrite(id);
  const { publish } = schema.parse(await req.json().catch(() => ({})));
  await setCoursePublished(id, publish);
  return ok({ message: publish ? "Course published." : "Course unpublished." });
});
