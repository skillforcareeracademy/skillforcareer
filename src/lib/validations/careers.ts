import { z } from "zod";

/**
 * Careers & placements vocabulary — the "Send your CV" form on the public
 * careers page, and the Admin → Careers desk that tracks each candidate through
 * placement partners and hiring partners.
 *
 * Kept free of Prisma so the public form and the admin screens can import the
 * same labels and the same schema in the browser.
 */

export const EXPERIENCE_LEVELS = ["FRESHER", "EXPERIENCED"] as const;
export const JOB_MODES = ["ONSITE", "REMOTE", "HYBRID", "ANY"] as const;
export const CANDIDATE_STATUSES = [
  "NEW",
  "SHORTLISTED",
  "REFERRED",
  "INTERVIEWING",
  "PLACED",
  "NOT_PLACED",
  "ON_HOLD",
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type JobMode = (typeof JOB_MODES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  FRESHER: "Fresher",
  EXPERIENCED: "Experienced",
};

export const JOB_MODE_LABELS: Record<JobMode, string> = {
  ONSITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ANY: "Any mode",
};

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  NEW: "New",
  SHORTLISTED: "Shortlisted",
  REFERRED: "Referred",
  INTERVIEWING: "Interviewing",
  PLACED: "Placed",
  NOT_PLACED: "Not placed",
  ON_HOLD: "On hold",
};

/** Badge tint per status — the admin table and the candidate sheet share it. */
export const CANDIDATE_STATUS_COLORS: Record<CandidateStatus, string> = {
  NEW: "#3B82F6",
  SHORTLISTED: "#8B5CF6",
  REFERRED: "#6366F1",
  INTERVIEWING: "#F59E0B",
  PLACED: "#059669",
  NOT_PLACED: "#EF4444",
  ON_HOLD: "#71717A",
};

/** Admin → Careers tabs, kept here so the server page can validate `?tab=`
 *  without importing a value out of a client module. */
export const CAREERS_TABS = ["candidates", "placement", "hiring"] as const;
export type CareersTab = (typeof CAREERS_TABS)[number];

/** The course picker's "my course isn't listed" choice. */
export const OTHER_COURSE = "OTHER";

/**
 * CV size cap. The brief said 5 MB, but the site runs on Vercel, which refuses
 * any function request body over 4.5 MB before our code ever sees it — a 4.8 MB
 * CV would fail with a bare platform error. 4 MB leaves room for the rest of the
 * form in the same multipart request, and is still generous for a CV.
 */
export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_MAX_LABEL = "4 MB";

/** PDF and Word only — what recruiters on the other end can actually open. */
export const CV_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const CV_ACCEPT = `.pdf,.doc,.docx,${CV_MIME_TYPES.join(",")}`;

/**
 * How many CVs one email address may send in 24 hours. Someone correcting a
 * typo or sending an updated CV gets a second go; a script hammering the form
 * does not.
 */
export const APPLICATIONS_PER_EMAIL_PER_DAY = 3;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** "" / null / undefined all mean "clear this field" on an admin update. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const nullableId = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

// ── Public: the "Send your CV" form ─────────────────────────────────────────

export const jobApplicationSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
    phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
    /** A course id, or OTHER when theirs isn't listed. */
    courseId: z.string().trim().min(1, "Pick your course, or choose Other").max(40),
    /** Free text when the course is OTHER. */
    courseName: optionalText(160),
    /** As printed on the certificate. */
    batchCode: optionalText(80),
    jobExpecting: z
      .string()
      .trim()
      .min(2, "Tell us the role you're looking for")
      .max(120),
    experienceLevel: z.enum(EXPERIENCE_LEVELS, {
      error: "Choose fresher or experienced",
    }),
    experienceDetails: optionalText(2000),
    currentAddress: z
      .string()
      .trim()
      .min(5, "Enter your current address")
      .max(500),
    expectedLocation: z
      .string()
      .trim()
      .min(2, "Where would you like to work?")
      .max(120),
    expectedMode: z.enum(JOB_MODES, { error: "Choose a job mode" }),
    joiningAvailability: z
      .string()
      .trim()
      .min(2, "Tell us when you can join")
      .max(120),
    /** Set when the visitor applied from an open role on the careers page. */
    hiringPostId: optionalText(40),
    consent: z.literal(true, {
      error: "Please agree so we can share your CV with employers",
    }),
  })
  .superRefine((v, ctx) => {
    if (v.experienceLevel === "EXPERIENCED" && !v.experienceDetails?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["experienceDetails"],
        message: "Tell us about your experience — company, role and years",
      });
    }
  });

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;

// ── Admin: a candidate's placement journey ──────────────────────────────────

export const candidateUpdateSchema = z.object({
  status: z.enum(CANDIDATE_STATUSES).optional(),
  placementPartnerId: nullableId,
  hiringPartnerId: nullableId,
  hiringPostId: nullableId,
  /** yyyy-mm-dd from a date input; "" clears it. */
  placedAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Enter a valid placement date" });
        return z.NEVER;
      }
      return d;
    }),
  placedCompany: nullableText(160),
  placedRole: nullableText(160),
  placedPackage: nullableText(80),
  adminNotes: nullableText(5000),
});

export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>;

// ── Admin: placement partners and hiring partners ───────────────────────────

const websiteField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(""))
  .refine(
    (v) => !v || /^https?:\/\/\S+$/i.test(v) || /^[\w-]+(\.[\w-]+)+\S*$/.test(v),
    "Enter a valid website",
  );

/** Same shape for both kinds of partner company. */
export const partnerSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  contactPerson: optionalText(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(120)
    .optional()
    .or(z.literal("")),
  phone: optionalText(30),
  website: websiteField,
  city: optionalText(120),
  notes: optionalText(5000),
  isActive: z.boolean().optional(),
});

export const partnerUpdateSchema = partnerSchema.partial();

export type PartnerInput = z.infer<typeof partnerSchema>;
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;

export const hiringPostSchema = z.object({
  title: z.string().trim().min(2, "Enter the job title").max(160),
  level: z.enum(EXPERIENCE_LEVELS),
  openings: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v == null || v === "") return null;
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        ctx.addIssue({ code: "custom", message: "Openings must be a number" });
        return z.NEVER;
      }
      return n;
    }),
  location: optionalText(160),
  mode: z.enum(JOB_MODES).nullable().optional(),
  salary: optionalText(80),
  description: optionalText(5000),
  isOpen: z.boolean().optional(),
});

export const hiringPostUpdateSchema = hiringPostSchema.partial();

export type HiringPostInput = z.infer<typeof hiringPostSchema>;
export type HiringPostUpdateInput = z.infer<typeof hiringPostUpdateSchema>;
