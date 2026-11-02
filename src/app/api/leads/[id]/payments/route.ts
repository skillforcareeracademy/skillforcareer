import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiLeadPayment } from "@/lib/auth/api-guard";
import { collectLeadPaymentSchema } from "@/lib/validations/lead-payment";
import {
  collectLeadPayment,
  leadPaymentContext,
} from "@/server/services/lead-payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireApiLeadPayment(id, { write: false });
  return ok(await leadPaymentContext(id));
});

/** Record money already taken at the desk, and enrol the learner against it. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireApiLeadPayment(id, { write: true });
  const input = collectLeadPaymentSchema.parse(await req.json().catch(() => ({})));
  return created(await collectLeadPayment(id, input));
});
