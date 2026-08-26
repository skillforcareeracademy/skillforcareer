import { z } from "zod";

export const CERTIFICATE_STATUSES = ["ISSUED", "REVOKED"] as const;
export const CERTIFICATE_STATUS_LABEL: Record<string, string> = {
  ISSUED: "Issued",
  REVOKED: "Revoked",
};

/**
 * The four awards the academy hands out, each with its own printed design.
 *
 * They differ in more than styling: a course completion is about a syllabus, an
 * internship is about a period of work, and an appreciation is about the person.
 * So each declares which extra fields its design actually prints, and the issue
 * form asks for exactly those.
 */
export const CERTIFICATE_TYPES = [
  "COURSE_COMPLETION",
  "APPRECIATION",
  "INTERNSHIP_COMPLETION",
  "INTERNSHIP_APPRECIATION",
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export interface CertificateTypeMeta {
  label: string;
  /** The words printed as the certificate's own heading. */
  heading: string;
  description: string;
  /** Whether the design has a course to name — drives the form and the schema. */
  needsCourse: boolean;
  fields: readonly CertificateFieldName[];
}

export type CertificateFieldName =
  | "batchName"
  | "courseStartDate"
  | "courseEndDate"
  | "instructorName"
  | "programArea"
  | "organisation"
  | "startDate"
  | "endDate"
  | "period"
  | "citation"
  | "internalNote";

export const CERTIFICATE_TYPE_META: Record<CertificateType, CertificateTypeMeta> = {
  COURSE_COMPLETION: {
    label: "Course certificate",
    heading: "Certificate of Excellence",
    description: "The classic award — course, batch and date, with a scannable verification code.",
    needsCourse: true,
    fields: [
      "batchName",
      "courseStartDate",
      "courseEndDate",
      "instructorName",
      "internalNote",
    ],
  },
  INTERNSHIP_COMPLETION: {
    label: "Internship completion",
    heading: "Certificate of Completion",
    description: "For a finished internship — names the work area and the dates served.",
    needsCourse: false,
    fields: [
      "programArea",
      "organisation",
      "startDate",
      "endDate",
      "citation",
      "internalNote",
    ],
  },
  APPRECIATION: {
    label: "Learner appreciation",
    heading: "Certificate of Appreciation",
    description: "Recognises the learner rather than a syllabus. No course required.",
    needsCourse: false,
    fields: ["citation", "internalNote"],
  },
  INTERNSHIP_APPRECIATION: {
    label: "Internship appreciation",
    heading: "Certificate of Internship",
    description: "A period award — “for outstanding performance in the month of…”.",
    needsCourse: false,
    fields: ["period", "organisation", "citation", "internalNote"],
  },
};

/** Label and placeholder for each extra field, so the form needs no per-type code. */
export const CERTIFICATE_FIELD_META: Record<
  CertificateFieldName,
  {
    label: string;
    placeholder: string;
    type: "text" | "textarea" | "date" | "batch" | "instructor";
    hint?: string;
    /** Recorded for the academy, never printed on the certificate. */
    internal?: boolean;
  }
> = {
  batchName: {
    label: "Batch",
    placeholder: "Web Development Batch 1",
    type: "batch",
    hint: "Pick a batch, or type one that isn't on the list. Printed under the course.",
  },
  courseStartDate: { label: "Course start date", placeholder: "", type: "date" },
  courseEndDate: { label: "Course completion date", placeholder: "", type: "date" },
  instructorName: {
    label: "Instructor",
    placeholder: "Choose or type a name",
    type: "instructor",
    hint: "Printed as the trainer. Fills in from the batch where it has one.",
  },
  internalNote: {
    label: "Internal note",
    placeholder: "Only the academy sees this…",
    type: "textarea",
    internal: true,
    hint: "Kept on the record for your team. Never printed on the certificate.",
  },
  programArea: {
    label: "Work area",
    placeholder: "Web Development",
    type: "text",
  },
  organisation: {
    label: "Organisation",
    placeholder: "Skill For Career",
    type: "text",
    hint: "Where the internship was served. Defaults to the site name.",
  },
  startDate: { label: "From", placeholder: "", type: "date" },
  endDate: { label: "To", placeholder: "", type: "date" },
  period: {
    label: "Period",
    placeholder: "the month of December",
    type: "text",
    hint: "Completes “for outstanding performance in …”.",
  },
  citation: {
    label: "Citation",
    placeholder: "Why this award is being given…",
    type: "textarea",
    hint: "The paragraph in the middle of the certificate. Leave blank for the standard wording.",
  },
};

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const isoDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

/** The per-design copy stored on `Certificate.metadata`. */
export const certificateDetailsSchema = z.object({
  batchName: text(120),
  courseStartDate: isoDay,
  courseEndDate: isoDay,
  instructorName: text(120),
  internalNote: text(1200),
  programArea: text(120),
  organisation: text(120),
  startDate: isoDay,
  endDate: isoDay,
  period: text(120),
  citation: text(1200),
});

export type CertificateDetails = z.infer<typeof certificateDetailsSchema>;

export const issueCertificateSchema = certificateDetailsSchema.extend({
  userId: z.string().min(1, "Choose a learner"),
  type: z.enum(CERTIFICATE_TYPES).default("COURSE_COMPLETION"),
  courseId: z.string().optional().or(z.literal("")),
});

/**
 * A course-completion certificate without a course would print a blank line
 * where the course name goes, so it is refused at the door rather than
 * discovered at print time.
 */
export const issueCertificateInputSchema = issueCertificateSchema.refine(
  (v) => !CERTIFICATE_TYPE_META[v.type].needsCourse || Boolean(v.courseId),
  { message: "Choose a course for this certificate type", path: ["courseId"] },
);

export const setCertificateStatusSchema = z.object({
  status: z.enum(CERTIFICATE_STATUSES),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateInputSchema>;

/** Read stored metadata back, tolerating rows written before a field existed. */
export function parseCertificateDetails(stored: unknown): CertificateDetails {
  const parsed = certificateDetailsSchema.safeParse(
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {},
  );
  return parsed.success
    ? parsed.data
    : {
        batchName: "",
        courseStartDate: "",
        courseEndDate: "",
        instructorName: "",
        internalNote: "",
        programArea: "",
        organisation: "",
        startDate: "",
        endDate: "",
        period: "",
        citation: "",
      };
}
