import { z } from "zod";

/**
 * Lead / admissions CRM vocabulary.
 *
 * The nine stages and their sub-statuses come straight from the client's
 * "Skill_Training_Academy_Lead_Statuses" sheet, colours included. Stages are a
 * Prisma enum (they drive indexes and filters); sub-statuses are plain strings
 * held in this catalogue, so a counsellor's wording can change without a
 * migration — anything already stored keeps rendering.
 */

export const LEAD_STAGES = [
  "FRESH_LEAD",
  "CONTACTED",
  "INTERESTED",
  "COUNSELLING_DEMO",
  "FOLLOW_UP",
  "ADMISSION_PENDING",
  "CONVERTED",
  "NOT_INTERESTED",
  "INVALID_LEAD",
] as const;

export const LEAD_SOURCES = [
  "WEBSITE",
  "MANUAL",
  "REFERRAL",
  "PHONE",
  "WALK_IN",
  "SOCIAL",
] as const;

export const LEAD_CLASS_MODES = [
  "ONLINE",
  "OFFLINE",
  "HYBRID",
  "RECORDED",
  "ANY",
] as const;

export const LEAD_QUALITIES = ["HOT", "WARM", "COLD", "NOT_SURE"] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadClassMode = (typeof LEAD_CLASS_MODES)[number];
export type LeadQuality = (typeof LEAD_QUALITIES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  FRESH_LEAD: "Fresh Lead",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  COUNSELLING_DEMO: "Counselling / Demo",
  FOLLOW_UP: "Follow-up",
  ADMISSION_PENDING: "Admission Pending",
  CONVERTED: "Converted",
  NOT_INTERESTED: "Not Interested",
  INVALID_LEAD: "Invalid Lead",
};

/** Hex per the client's sheet — used for the badge dot and the CSV/legend. */
export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  FRESH_LEAD: "#3B82F6",
  CONTACTED: "#8B5CF6",
  INTERESTED: "#EC4899",
  COUNSELLING_DEMO: "#F59E0B",
  FOLLOW_UP: "#6366F1",
  ADMISSION_PENDING: "#F97316",
  CONVERTED: "#059669",
  NOT_INTERESTED: "#EF4444",
  INVALID_LEAD: "#DC2626",
};

/** The sub-status each stage may carry, in the sheet's own order. */
export const LEAD_SUB_STATUSES: Record<LeadStage, readonly string[]> = {
  FRESH_LEAD: ["Not Assigned", "Assigned", "New Lead", "Enquiry Received"],
  CONTACTED: [
    "Call Connected",
    "WhatsApp Contacted",
    "Email Contacted",
    "No Answer",
    "Busy",
    "Switched Off",
    "Call Back Requested",
    "Wrong Number",
  ],
  INTERESTED: [
    "Course Interested",
    "Fee Enquiry",
    "Batch Enquiry",
    "Career Enquiry",
    "Syllabus Enquiry",
    "Placement Enquiry",
    "Counselling Required",
  ],
  COUNSELLING_DEMO: [
    "Counselling Scheduled",
    "Counselling Done",
    "Demo Class Scheduled",
    "Demo Class Attended",
    "Orientation Scheduled",
    "Orientation Attended",
  ],
  FOLLOW_UP: [
    "Follow-up Required",
    "Call Back",
    "Parent Discussion Pending",
    "Decision Pending",
    "Comparing Courses",
    "Payment Follow-up",
  ],
  ADMISSION_PENDING: [
    "Documents Pending",
    "Registration Pending",
    "Fee Payment Pending",
    "Batch Selection Pending",
    "Joining Date Pending",
  ],
  CONVERTED: [
    "Admission Confirmed",
    "Fee Paid",
    "Batch Assigned",
    "Student Onboarded",
    "Course Started",
  ],
  NOT_INTERESTED: [
    "Budget Issue",
    "Course Not Suitable",
    "Joined Another Institute",
    "Planned Later",
    "Family Decision",
    "No Response After Follow-ups",
    "Duplicate Lead",
    "False Enquiry",
  ],
  INVALID_LEAD: [
    "Wrong Number",
    "Incomplete Number",
    "Fake/Spam Enquiry",
    "Student Not Eligible",
    "Duplicate Lead",
  ],
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  MANUAL: "Manual",
  REFERRAL: "Referral",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  SOCIAL: "Social",
};

export const LEAD_QUALITY_LABELS: Record<LeadQuality, string> = {
  HOT: "Hot",
  WARM: "Warm",
  COLD: "Cold",
  NOT_SURE: "Not sure",
};

/** Warm/cold reads as temperature, so the palette does too. */
export const LEAD_QUALITY_COLORS: Record<LeadQuality, string> = {
  HOT: "#EF4444",
  WARM: "#F59E0B",
  COLD: "#0EA5E9",
  NOT_SURE: "#94A3B8",
};

export const LEAD_CLASS_MODE_LABELS: Record<LeadClassMode, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  HYBRID: "Hybrid",
  RECORDED: "Recorded",
  ANY: "Any",
};

/** Stages that mean the lead is still live in the funnel. */
export const OPEN_LEAD_STAGES: readonly LeadStage[] = [
  "FRESH_LEAD",
  "CONTACTED",
  "INTERESTED",
  "COUNSELLING_DEMO",
  "FOLLOW_UP",
  "ADMISSION_PENDING",
];

/**
 * The "Interested" stat card: every open stage after the lead has said yes to
 * the course — Interested itself, then Counselling / Demo, Follow-up and
 * Admission Pending, which only a lead who showed interest reaches. Contacted
 * stays out: its statuses are mostly "No Answer", "Busy", "Switched Off" —
 * reached, not yet interested. Fresh and the three closed stages stay out too.
 */
export const INTERESTED_LEAD_STAGES: readonly LeadStage[] = [
  "INTERESTED",
  "COUNSELLING_DEMO",
  "FOLLOW_UP",
  "ADMISSION_PENDING",
];

/** Is `sub` a listed sub-status of `stage`? Unknown values are let through. */
export function isSubStatusOf(
  stage: LeadStage,
  sub: string | null | undefined,
): boolean {
  if (!sub) return true;
  return LEAD_SUB_STATUSES[stage].includes(sub);
}

// ── Field-level helpers ──────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/**
 * Update semantics for the lead's own fields: `undefined` leaves a field alone,
 * while `""` and `null` clear it. The inline table editors and the edit tab
 * both rely on this to take a follow-up date, a score or an assignee back off.
 */
const clearableText = (max: number) =>
  z.string().trim().max(max).nullable().optional().or(z.literal(""));

/**
 * "" → undefined, and "35000" / "35,000" / "₹35,000" / "35k" → 35000.
 *
 * The "k" shorthand is not a nicety: the client's own sheet writes
 * "Fees Offered*: 35k", so a counsellor copying that into the form must not end
 * up with a fee of ₹35. Shared with the CSV importer so both doors agree.
 */
export function parseAmount(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[₹,\s]/g, "");
  if (!cleaned) return undefined;
  const k = /^(\d+(?:\.\d+)?)k$/.exec(cleaned);
  const n = k ? Number(k[1]) * 1000 : Number(cleaned.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

const money = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === "" ? null : parseAmount(v)))
  .refine(
    (n) => n == null || (n >= 0 && n <= 10_000_000),
    "Enter a valid amount",
  );

/** A whole number within `min`–`max`; "" and null clear it. */
const wholeNumber = (min: number, max: number, message: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Math.trunc(Number(v));
      return Number.isFinite(n) ? n : undefined;
    })
    .refine((n) => n == null || (n >= min && n <= max), message);

const count = wholeNumber(0, 60, "EMI count must be 0–60");

/** Accepts "2026-08-25" or an ISO instant; "" and null clear it. */
const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

/** The lead-received date can be moved but never emptied. */
const requiredDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

/** "16:30" / "4:30 PM" — stored as a wall-clock slot, never an instant. */
const optionalTime = z
  .string()
  .trim()
  .max(12)
  .nullable()
  .optional()
  .or(z.literal(""))
  .refine(
    (v) => !v || /^([01]?\d|2[0-3]):[0-5]\d(\s?[apAP]\.?[mM]\.?)?$/.test(v),
    "Enter a time like 16:30",
  );

// ── Schemas ──────────────────────────────────────────────────────────────────

/**
 * The number a given channel should use. WhatsApp prefers the lead's WhatsApp
 * number and falls back to the phone; calls and SMS always use the phone, since
 * a WhatsApp-only number often isn't reachable any other way.
 */
export function contactNumber(
  lead: { phone: string; whatsapp?: string | null },
  channel: LeadContactChannel,
): string {
  if (channel === "WHATSAPP" && lead.whatsapp?.trim()) return lead.whatsapp.trim();
  return lead.phone;
}

/**
 * A `tel:` / `wa.me` / `sms:` target for the counsellor's device.
 *
 * wa.me needs a bare international number with no `+` or separators; an Indian
 * ten-digit number typed without a country code would open a chat with the
 * wrong person, so it gets 91 prefixed.
 */
export function contactHref(number: string, channel: LeadContactChannel): string {
  const digits = number.replace(/\D/g, "");
  if (channel === "WHATSAPP") {
    const intl = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${intl}`;
  }
  const dialable = number.trim().startsWith("+") ? `+${digits}` : digits;
  return channel === "SMS" ? `sms:${dialable}` : `tel:${dialable}`;
}

/** Public website enquiry form — deliberately short. */
export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(120)
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().min(6, "Enter a valid phone").max(20),
  courseInterest: optionalText(120),
  message: optionalText(2000),
});

/** Every counsellor-editable field on the client's sheet. */
const leadFields = {
  name: z.string().trim().min(2, "Enter a name").max(80),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(120)
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  /// Blank means "same as phone" — see `whatsappNumber()`.
  whatsapp: clearableText(20),

  /** "Date of lead received" — when the enquiry actually came in. */
  leadDate: requiredDate,
  courseId: clearableText(40),
  courseInterest: clearableText(120),
  whyThisCourse: clearableText(1000),

  quality: z.enum(LEAD_QUALITIES).nullable().optional().or(z.literal("")),
  leadScore: wholeNumber(0, 100, "Lead score must be 0–100"),

  stage: z.enum(LEAD_STAGES).optional(),
  subStatus: clearableText(60),
  classMode: z.enum(LEAD_CLASS_MODES).nullable().optional().or(z.literal("")),

  qualification: clearableText(120),
  jobStatus: clearableText(120),
  experiencedIn: clearableText(160),
  address: clearableText(500),

  expectedVisit: clearableText(160),
  visitDate: optionalDate,
  visitTime: optionalTime,

  followUpDate: optionalDate,
  followUpTime: optionalTime,

  message: clearableText(2000),

  feesOffered: money,
  finalFees: money,
  emiCount: count,

  assignedToId: clearableText(40),
};

/**
 * Admin "Add lead". The client starred Number, Expected visit and Fees Offered
 * as mandatory on their sheet, so the manual form enforces all three — website
 * enquiries and CSV imports (which can't ask) stay on the looser schemas.
 */
export const createLeadSchema = z.object({
  ...leadFields,
  source: z.enum(LEAD_SOURCES).default("MANUAL"),
  expectedVisit: z
    .string()
    .trim()
    .min(1, "Expected visit is required")
    .max(160),
  feesOffered: money.refine((n) => n != null, "Fees offered is required"),
});

export const updateLeadSchema = z
  .object({ ...leadFields, source: z.enum(LEAD_SOURCES).optional() })
  .partial();

export const followUpSchema = z.object({
  note: z.string().trim().min(1, "Add a remark").max(2000),
  stage: z.enum(LEAD_STAGES).optional(),
  subStatus: optionalText(60),
  /** Schedule the next call-back while writing up this one. It is kept on the
   *  remark as well as the lead, so the history shows what was promised when. */
  followUpDate: optionalDate,
  followUpTime: optionalTime,
});

/** Attach an already-uploaded document (POST /api/upload gives us the URL). */
export const leadDocumentSchema = z.object({
  name: z.string().trim().min(1, "File name is required").max(160),
  url: z.string().trim().min(1, "File URL is required").max(2000),
  mime: optionalText(120),
  size: z.coerce.number().int().nonnegative().optional(),
});

/** How a counsellor can reach a lead straight from the CRM. */
export const LEAD_CONTACT_CHANNELS = ["CALL", "WHATSAPP", "SMS"] as const;
export type LeadContactChannel = (typeof LEAD_CONTACT_CHANNELS)[number];

export const LEAD_CONTACT_CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
};

/** Logged when a counsellor taps one of the contact icons. */
export const leadContactSchema = z.object({
  channel: z.enum(LEAD_CONTACT_CHANNELS),
});

export const LEAD_REMINDER_CHANNELS = ["EMAIL", "SMS"] as const;
export type LeadReminderChannel = (typeof LEAD_REMINDER_CHANNELS)[number];

export const leadReminderSchema = z.object({
  channels: z
    .array(z.enum(LEAD_REMINDER_CHANNELS))
    .min(1, "Pick at least one channel"),
  message: optionalText(600),
});

/** CSV paste/upload. `text` is the raw file; the server does the parsing. */
export const importLeadsSchema = z.object({
  csv: z.string().min(1, "Paste or upload a CSV first").max(2_000_000),
  source: z.enum(LEAD_SOURCES).default("MANUAL"),
  skipDuplicatePhones: z.boolean().default(true),
});

/** Delete the duplicate rows an admin ticked in the duplicates dialog. */
export const removeDuplicatesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Pick the leads to remove").max(500),
});

// ── List view: filters, sort and stat cards ─────────────────────────────────

/**
 * Every list filter, in URL order. The table, its Report and Export downloads
 * and the detail sheet's previous / next all read these same keys, so they can
 * never disagree about which leads are "in view". `assignedToId` also takes
 * "unassigned" and "me" (whoever is signed in).
 */
export const LEAD_FILTER_KEYS = [
  "search",
  "stage",
  "subStatus",
  "source",
  "classMode",
  "courseId",
  "assignedToId",
  "quality",
  "minScore",
  "due",
  "from",
  "to",
  "uploadedFrom",
  "uploadedTo",
] as const;
export type LeadFilterKey = (typeof LEAD_FILTER_KEYS)[number];

export const LEAD_SORTS = [
  "received_desc",
  "received_asc",
  "uploaded_desc",
  "followup_asc",
  "score_desc",
  "name_asc",
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];
export const DEFAULT_LEAD_SORT: LeadSort = "received_desc";

export const LEAD_SORT_LABELS: Record<LeadSort, string> = {
  received_desc: "Newest received",
  received_asc: "Oldest received",
  uploaded_desc: "Recently uploaded",
  followup_asc: "Next follow-up first",
  score_desc: "Highest lead score",
  name_asc: "Name A–Z",
};

/** The list's filters plus its sort, exactly as they travel in a URL. */
export type LeadViewParams = Partial<Record<LeadFilterKey | "sort", string>>;

/** Read the filters and sort out of a URL's query (page, route or API). */
export function leadViewFrom(
  get: (key: string) => string | null | undefined,
): LeadViewParams {
  const out: LeadViewParams = {};
  for (const key of [...LEAD_FILTER_KEYS, "sort"] as const) {
    const value = get(key)?.trim();
    if (value) out[key] = value;
  }
  if (out.sort && !(LEAD_SORTS as readonly string[]).includes(out.sort)) {
    delete out.sort;
  }
  return out;
}

/** The boxes that can sit above the lead list; each counsellor picks theirs. */
export const LEAD_STAT_CARDS = [
  "total",
  "fresh",
  "inProgress",
  "interested",
  "converted",
  "notInterested",
  "followUpsToday",
  "overdue",
  "visitsToday",
  "hot",
  "unassigned",
  "mine",
  "receivedThisWeek",
] as const;
export type LeadStatCard = (typeof LEAD_STAT_CARDS)[number];

export const DEFAULT_LEAD_STAT_CARDS: readonly LeadStatCard[] = [
  "total",
  "fresh",
  "inProgress",
  "interested",
  "converted",
  "notInterested",
];

export const LEAD_STAT_CARD_LABELS: Record<LeadStatCard, string> = {
  total: "Total leads",
  fresh: "Fresh",
  inProgress: "In progress",
  interested: "Interested",
  converted: "Converted",
  notInterested: "Not interested",
  followUpsToday: "Follow-ups today",
  overdue: "Overdue follow-ups",
  visitsToday: "Visits today",
  hot: "Hot leads",
  unassigned: "Unassigned",
  mine: "Assigned to me",
  receivedThisWeek: "Received this week",
};

/** One line each for the "Customize cards" menu and the card's tooltip. */
export const LEAD_STAT_CARD_HINTS: Record<LeadStatCard, string> = {
  total: "Every lead in the system",
  fresh: "Not worked yet",
  inProgress: "Worked and still open — contacted to admission pending",
  interested: "Interested, counselling / demo, follow-up or admission pending",
  converted: "Admitted",
  notInterested: "Not interested or invalid",
  followUpsToday: "Open leads with a call-back booked for today",
  overdue: "Open leads whose call-back day has passed",
  visitsToday: "Open leads due at the centre today",
  hot: "Open leads rated Hot",
  unassigned: "Nobody is working these yet",
  mine: "Leads assigned to you",
  receivedThisWeek: "Received in the last 7 days",
};

export const leadCardPrefsSchema = z.object({
  cards: z.array(z.enum(LEAD_STAT_CARDS)).max(LEAD_STAT_CARDS.length),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;
export type LeadDocumentInput = z.infer<typeof leadDocumentSchema>;
export type LeadReminderInput = z.infer<typeof leadReminderSchema>;
export type LeadContactInput = z.infer<typeof leadContactSchema>;
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;
export type RemoveDuplicatesInput = z.infer<typeof removeDuplicatesSchema>;
export type LeadCardPrefsInput = z.infer<typeof leadCardPrefsSchema>;
