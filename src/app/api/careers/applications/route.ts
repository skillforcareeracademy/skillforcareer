import { after } from "next/server";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { jobApplicationSchema } from "@/lib/validations/careers";
import {
  announceApplication,
  submitApplication,
} from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THANKS = "Thanks! Your CV has reached our placement team.";

/**
 * Public: the careers page's "Send your CV" form. Multipart — the details and
 * the CV travel together, so nothing is stored unless the whole submission is
 * valid (there is deliberately no public upload endpoint to abuse on its own).
 */
export const POST = withRoute(async (req) => {
  const form = await req.formData().catch(() => {
    throw AppError.badRequest("Couldn't read the form. Please try again.");
  });
  // A missing field reads as empty, so the visitor gets the schema's own
  // wording ("Enter your full name") rather than a type error.
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };

  // Honeypot: a field people never see. Anything that fills it is a script, and
  // it gets the same thank-you as everyone else so it learns nothing.
  if (text("website").trim()) return created({ message: THANKS });

  const input = jobApplicationSchema.parse({
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    courseId: text("courseId"),
    courseName: text("courseName"),
    batchCode: text("batchCode"),
    jobExpecting: text("jobExpecting"),
    experienceLevel: text("experienceLevel"),
    experienceDetails: text("experienceDetails"),
    currentAddress: text("currentAddress"),
    expectedLocation: text("expectedLocation"),
    expectedMode: text("expectedMode"),
    joiningAvailability: text("joiningAvailability"),
    hiringPostId: text("hiringPostId"),
    consent: text("consent") === "true",
  });

  const cv = form.get("cv");
  if (!(cv instanceof File)) throw AppError.badRequest("Attach your CV (PDF or Word).");

  // A signed-in learner's CV is tied to their account, so the placement team
  // can open their full profile from the candidate.
  const viewer = await getSessionUser();
  const userId = viewer?.role === ROLES.STUDENT ? viewer.id : null;

  const application = await submitApplication(input, cv, userId);

  // Emails and the bell go out after the response — the applicant shouldn't
  // wait on an SMTP handshake to see their confirmation.
  after(() => announceApplication(application));

  return created({ id: application.id, message: THANKS });
});
