import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { createCourseOrder } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  courseId: z.string().min(1, "Choose a course"),
  couponCode: z.string().trim().max(30).optional().or(z.literal("")),
});

/** Start a Razorpay checkout for a paid course. Returns what the browser widget needs. */
export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { courseId, couponCode } = bodySchema.parse(await req.json().catch(() => ({})));
  const session = await createCourseOrder(user.id, courseId, couponCode || undefined);
  return ok(session);
});
