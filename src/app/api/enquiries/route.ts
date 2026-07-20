import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { enquirySchema } from "@/lib/validations/lead";
import { createLead } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: website enquiry form → creates a WEBSITE lead. No auth. */
export const POST = withRoute(async (req) => {
  const input = enquirySchema.parse(await req.json().catch(() => ({})));
  await createLead(input, "WEBSITE");
  return created({ message: "Thanks! Our team will reach out to you shortly." });
});
