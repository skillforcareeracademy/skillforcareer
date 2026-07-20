import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { enrollInCourse } from "@/server/services/enrollment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ courseId: z.string().min(1) });

export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { courseId } = bodySchema.parse(await req.json().catch(() => ({})));
  const { slug } = await enrollInCourse(user.id, courseId);
  return created({ slug, message: "Enrolled." });
});
