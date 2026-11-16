import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { notify } from "./notification-service";
import { sendMail } from "@/lib/mail/mailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  COMPLETION_FIELDS,
  LOCKED_AFTER_SUBMIT,
  type StudentDetailInput,
} from "@/lib/validations/student-detail";

/**
 * The learner's onboarding form.
 *
 * The academy's rules, in order: the learner fills it in; once submitted the
 * documents and the schooling are read-only to them, because admissions has
 * verified them; staff can still change anything; and when admissions converts
 * a lead into a learner, whatever the lead sheet already knows is carried over
 * so nobody is asked twice.
 */

const str = (v: string | undefined): string | null =>
  v === undefined ? null : v.trim() === "" ? null : v.trim();

export interface StudentDetailView {
  /** Null until the learner or staff has saved something. */
  detail: StudentDetailRow | null;
  submitted: boolean;
  /** 0–100, over the fields the academy counts. */
  completion: number;
  /** Labels of what is still missing, in form order. */
  missing: string[];
  /** Fields the learner may no longer change themselves. */
  lockedFields: string[];
}

export interface StudentDetailRow {
  whatsapp: string | null;
  alternatePhone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  gender: string | null;
  fatherName: string | null;
  guardianPhone: string | null;
  aadhaarNumber: string | null;
  aadhaarUrl: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  idProofUrl: string | null;
  highestQualification: string | null;
  specialization: string | null;
  collegeName: string | null;
  passingYear: number | null;
  marksPercent: string | null;
  cvUrl: string | null;
  cvName: string | null;
  jobStatus: string | null;
  currentCompany: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  currentPackage: number | null;
  expectedPackage: number | null;
  preferredLocations: string | null;
  preferredMode: string | null;
  willingToRelocate: boolean;
  openToPlacement: boolean;
  submittedAt: string | null;
  updatedByStaffAt: string | null;
}

type DbDetail = Prisma.StudentDetailGetPayload<object>;

function toRow(d: DbDetail): StudentDetailRow {
  return {
    whatsapp: d.whatsapp,
    alternatePhone: d.alternatePhone,
    addressLine: d.addressLine,
    city: d.city,
    state: d.state,
    pincode: d.pincode,
    country: d.country,
    gender: d.gender,
    fatherName: d.fatherName,
    guardianPhone: d.guardianPhone,
    aadhaarNumber: d.aadhaarNumber,
    aadhaarUrl: d.aadhaarUrl,
    idProofType: d.idProofType,
    idProofNumber: d.idProofNumber,
    idProofUrl: d.idProofUrl,
    highestQualification: d.highestQualification,
    specialization: d.specialization,
    collegeName: d.collegeName,
    passingYear: d.passingYear,
    marksPercent: d.marksPercent,
    cvUrl: d.cvUrl,
    cvName: d.cvName,
    jobStatus: d.jobStatus,
    currentCompany: d.currentCompany,
    currentRole: d.currentRole,
    experienceYears: d.experienceYears,
    currentPackage: d.currentPackage == null ? null : Number(d.currentPackage),
    expectedPackage: d.expectedPackage == null ? null : Number(d.expectedPackage),
    preferredLocations: d.preferredLocations,
    preferredMode: d.preferredMode,
    willingToRelocate: d.willingToRelocate,
    openToPlacement: d.openToPlacement,
    submittedAt: d.submittedAt?.toISOString() ?? null,
    updatedByStaffAt: d.updatedByStaffAt?.toISOString() ?? null,
  };
}

/** How far through the form they are, and what is left. */
export function completionOf(row: StudentDetailRow | null): {
  completion: number;
  missing: string[];
} {
  if (!row) {
    return { completion: 0, missing: COMPLETION_FIELDS.map((f) => f.label) };
  }
  const missing = COMPLETION_FIELDS.filter((f) => {
    const value = row[f.key as keyof StudentDetailRow];
    return value === null || value === undefined || value === "";
  }).map((f) => f.label);
  const done = COMPLETION_FIELDS.length - missing.length;
  return {
    completion: Math.round((done / COMPLETION_FIELDS.length) * 100),
    missing,
  };
}

export async function getStudentDetail(userId: string): Promise<StudentDetailView> {
  const found = await prisma.studentDetail.findUnique({ where: { userId } });
  const detail = found ? toRow(found) : null;
  const { completion, missing } = completionOf(detail);
  const submitted = Boolean(found?.submittedAt);
  return {
    detail,
    submitted,
    completion,
    missing,
    lockedFields: submitted ? [...LOCKED_AFTER_SUBMIT] : [],
  };
}

/** The columns a payload turns into, shared by the learner and staff paths. */
function dataFrom(input: StudentDetailInput): Prisma.StudentDetailUncheckedUpdateInput {
  return {
    whatsapp: str(input.whatsapp),
    alternatePhone: str(input.alternatePhone),
    addressLine: str(input.addressLine),
    city: str(input.city),
    state: str(input.state),
    pincode: str(input.pincode),
    country: str(input.country) ?? "India",
    gender: str(input.gender),
    fatherName: str(input.fatherName),
    guardianPhone: str(input.guardianPhone),
    aadhaarNumber: str(input.aadhaarNumber),
    aadhaarUrl: str(input.aadhaarUrl),
    idProofType: str(input.idProofType),
    idProofNumber: str(input.idProofNumber),
    idProofUrl: str(input.idProofUrl),
    highestQualification: str(input.highestQualification),
    specialization: str(input.specialization),
    collegeName: str(input.collegeName),
    passingYear: input.passingYear ?? null,
    marksPercent: str(input.marksPercent),
    cvUrl: str(input.cvUrl),
    cvName: str(input.cvName),
    jobStatus: str(input.jobStatus),
    currentCompany: str(input.currentCompany),
    currentRole: str(input.currentRole),
    experienceYears: str(input.experienceYears),
    currentPackage: input.currentPackage ?? null,
    expectedPackage: input.expectedPackage ?? null,
    preferredLocations: str(input.preferredLocations),
    preferredMode: str(input.preferredMode),
    willingToRelocate: input.willingToRelocate ?? false,
    openToPlacement: input.openToPlacement ?? true,
  };
}

/**
 * Let the learner know their onboarding details reached the office — "jab
 * students apni my details fill kr dete hain ya admin se koi fill kr deta hai
 * to student ko mail notification jaana chahiye ki your details have been
 * submitted", with the dynamic policy links alongside. Best-effort: a mail or
 * notification failure must never fail the save it is confirming.
 */
async function notifyDetailsSubmitted(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user?.email) return;

    const APP_URL = env.NEXT_PUBLIC_APP_URL;
    const firstName = user.name?.split(" ")[0] || "there";

    await notify({
      userIds: [userId],
      type: "SYSTEM",
      title: "Details submitted",
      message:
        "Your details have been submitted. Our team will take it from here.",
      actionUrl: "/student/profile/details",
    });

    const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="color:#e11d48">Details submitted</h2>
      <p>Hi ${firstName},</p>
      <p><strong>Your details have been submitted</strong> to Skill For Career. Our team will take it from here and will be in touch if anything further is needed.</p>
      <p style="margin:20px 0">
        <a href="${APP_URL}/student/profile/details"
           style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          View your details
        </a>
      </p>
      <p style="color:#666;font-size:13px">For any information about how we handle your information, please read our
        <a href="${APP_URL}/privacy">Privacy Policy</a>,
        <a href="${APP_URL}/terms">Terms &amp; Conditions</a> and
        <a href="${APP_URL}/cookies">Cookie Policy</a>.</p>
      <p style="color:#666;font-size:13px">— SkillForCareer</p>
    </div>`;

    const text = `Hi ${firstName}, your details have been submitted to Skill For Career. View them at ${APP_URL}/student/profile/details. Our policies — Privacy: ${APP_URL}/privacy · Terms & Conditions: ${APP_URL}/terms · Cookies: ${APP_URL}/cookies.`;

    await sendMail({
      to: user.email,
      subject: "Your details have been submitted",
      html,
      text,
    });
  } catch (error) {
    logger.warn("Couldn't send the details-submitted email", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The learner's own save. Anything already locked is ignored rather than
 * rejected — the form doesn't send those fields, and a stale tab that does
 * shouldn't fail in their face.
 */
export async function saveStudentDetail(
  userId: string,
  input: StudentDetailInput,
): Promise<StudentDetailView> {
  const existing = await prisma.studentDetail.findUnique({ where: { userId } });
  const data = dataFrom(input);

  if (existing?.submittedAt) {
    for (const field of LOCKED_AFTER_SUBMIT) {
      // Only protect a field that was actually filled when they submitted. A
      // field left blank at a premature submit can still be completed later,
      // so a learner isn't locked out of details they never entered.
      const prev = (existing as Record<string, unknown>)[field];
      const wasFilled = prev != null && String(prev).trim() !== "";
      if (wasFilled) delete data[field as keyof typeof data];
    }
  }
  const justSubmitted = Boolean(input.submit && !existing?.submittedAt);
  if (justSubmitted) {
    data.submittedAt = new Date();
  }

  if (existing) {
    await prisma.studentDetail.update({ where: { userId }, data });
  } else {
    await prisma.studentDetail.create({
      data: { ...(data as Prisma.StudentDetailUncheckedCreateInput), userId },
    });
  }
  // Confirm it reached us the moment they actually submit.
  if (justSubmitted) void notifyDetailsSubmitted(userId);
  return getStudentDetail(userId);
}

/**
 * Re-open a submitted profile so the learner can edit it again — the office's
 * "unlock" for a profile that was submitted too early or needs correcting.
 */
export async function unlockStudentDetail(
  userId: string,
): Promise<StudentDetailView> {
  await prisma.studentDetail.updateMany({
    where: { userId },
    data: { submittedAt: null },
  });
  return getStudentDetail(userId);
}

/** Staff can change anything, including what the learner can no longer touch. */
export async function saveStudentDetailByStaff(
  userId: string,
  input: StudentDetailInput,
): Promise<StudentDetailView> {
  const data = dataFrom(input);
  data.updatedByStaffAt = new Date();
  await prisma.studentDetail.upsert({
    where: { userId },
    update: data,
    create: { ...(data as Prisma.StudentDetailUncheckedCreateInput), userId },
  });
  // The office filled it on the learner's behalf — let the learner know.
  void notifyDetailsSubmitted(userId);
  return getStudentDetail(userId);
}

/**
 * Carry across what the lead sheet already knows, the moment a lead becomes a
 * learner. Only fills blanks: if the learner has already answered something,
 * their answer wins over the counsellor's note.
 */
export async function prefillFromLead(userId: string, leadId: string): Promise<void> {
  const [lead, existing] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        whatsapp: true,
        phone: true,
        address: true,
        qualification: true,
        jobStatus: true,
        experiencedIn: true,
      },
    }),
    prisma.studentDetail.findUnique({ where: { userId } }),
  ]);
  if (!lead) return;

  const filled = {
    whatsapp: lead.whatsapp ?? lead.phone ?? null,
    addressLine: lead.address ?? null,
    highestQualification: lead.qualification ?? null,
    jobStatus: lead.jobStatus ? lead.jobStatus.toUpperCase().slice(0, 20) : null,
    currentRole: lead.experiencedIn ?? null,
  };

  if (!existing) {
    await prisma.studentDetail.create({
      data: { userId, fromLeadId: leadId, ...filled },
    });
    return;
  }

  // Only the blanks.
  const patch: Prisma.StudentDetailUncheckedUpdateInput = { fromLeadId: leadId };
  for (const [key, value] of Object.entries(filled)) {
    if (!value) continue;
    if (existing[key as keyof typeof existing]) continue;
    (patch as Record<string, unknown>)[key] = value;
  }
  await prisma.studentDetail.update({ where: { userId }, data: patch });
}
