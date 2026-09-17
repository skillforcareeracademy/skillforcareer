import { z } from "zod";

/**
 * Platform settings — the typed shape stored (as JSON) in the single `Setting`
 * row. Grouped by the tabs shown on /admin/settings. Every field has a default
 * so a fresh install renders sensible values before anything is saved.
 */

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "Enter a valid URL")
  .or(z.literal(""));

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email")
  .or(z.literal(""));

export const settingsSchema = z.object({
  // ── General ──────────────────────────────────────────────────────────────
  siteName: z.string().trim().min(1, "Site name is required").max(80),
  tagline: z.string().trim().max(160),
  supportEmail: optionalEmail,
  contactPhone: z.string().trim().max(30),

  // ── Localization ─────────────────────────────────────────────────────────
  defaultTimezone: z.string().trim().max(60),
  defaultLocale: z.string().trim().max(10),
  currency: z.string().trim().min(1).max(6),

  // ── Branding ─────────────────────────────────────────────────────────────
  logoUrl: z.string().trim().max(500),
  faviconUrl: z.string().trim().max(500),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #E11D48"),

  // ── Registration & access ────────────────────────────────────────────────
  allowRegistration: z.boolean(),
  requireEmailVerification: z.boolean(),
  defaultRole: z.enum(["STUDENT", "INSTRUCTOR"]),
  maintenanceMode: z.boolean(),

  // ── Email & notifications ────────────────────────────────────────────────
  emailFromName: z.string().trim().max(80),
  emailFromAddress: optionalEmail,
  notifyOnEnrollment: z.boolean(),
  notifyOnPayment: z.boolean(),
  notifyOnNewUser: z.boolean(),

  // ── Certificates ─────────────────────────────────────────────────────────
  // Who signs the awards. The same two people sign every design, so this lives
  // once here rather than being retyped on each certificate.
  certLeftName: z.string().trim().max(80),
  certLeftTitle: z.string().trim().max(60),
  /// A scan of the real signature. Blank falls back to the name in a hand.
  certLeftSignatureUrl: z.string().trim().max(500),
  certRightName: z.string().trim().max(80),
  certRightTitle: z.string().trim().max(60),
  certRightSignatureUrl: z.string().trim().max(500),

  // ── Learning limits ──────────────────────────────────────────────────────
  // Platform-wide caps. A lesson, quiz or assignment may override its own; 0
  // anywhere means unlimited, which is what every course did before the client
  // asked for "watch limit on lectures, notes, assignments and quizzes".
  lessonViewLimit: z.coerce.number().int().min(0).max(999),
  lessonDownloadLimit: z.coerce.number().int().min(0).max(999),
  quizAttemptLimit: z.coerce.number().int().min(0).max(99),
  assignmentAttemptLimit: z.coerce.number().int().min(0).max(99),

  // ── Fees & EMI ───────────────────────────────────────────────────────────
  emiEnabled: z.boolean(),
  /// Whether the office may offer a plan with nothing added on top.
  emiZeroCostEnabled: z.boolean(),
  /// Annual rate applied to an interest-bearing plan, in percent.
  emiInterestPercent: z.coerce.number().min(0).max(60),
  emiMaxInstallments: z.coerce.number().int().min(2).max(36),

  // ── Assistant & guides ───────────────────────────────────────────────────
  chatbotEnabled: z.boolean(),
  chatbotName: z.string().trim().min(1).max(30),
  chatbotGreeting: z.string().trim().max(300),
  /// The guided walkthrough that runs the first time a panel is opened.
  tourEnabled: z.boolean(),
  /// Whether that walkthrough can also read itself aloud.
  voiceGuideEnabled: z.boolean(),

  // ── Coding Practice ──────────────────────────────────────────────────────
  // The separate medical-coding practice product. Its link in the panels signs
  // people straight in; the signing secret lives in the server environment
  // (CODING_PRACTICE_SSO_SECRET) and is never stored here.
  codingPracticeEnabled: z.boolean(),
  /// Where the product runs. Blank uses CODING_PRACTICE_URL from the server.
  codingPracticeUrl: optionalUrl,
  /// Who gets the link: anyone signed in, staff only, or learners with an
  /// active or completed enrolment (staff always count).
  codingPracticeAudience: z.enum(["everyone", "staff", "enrolled"]),

  // ── Social links ─────────────────────────────────────────────────────────
  socialWebsite: optionalUrl,
  socialLinkedin: optionalUrl,
  socialTwitter: optionalUrl,
  socialInstagram: optionalUrl,
  socialYoutube: optionalUrl,
});

export type Settings = z.infer<typeof settingsSchema>;

/** Partial update — the client PATCHes the whole object, but this tolerates
 *  older payloads that omit newly-added keys. */
export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  siteName: "SkillForCareer",
  tagline: "Learn the skills that get you hired.",
  supportEmail: "support@skillforcareer.com",
  contactPhone: "",

  defaultTimezone: "Asia/Kolkata",
  defaultLocale: "en",
  currency: "INR",

  // The client's own brand assets, bundled so a fresh install is on-brand
  // before anything is uploaded. Admin > Settings > Branding overrides these.
  logoUrl: "/images/brand/logo.png",
  faviconUrl: "/images/brand/favicon.png",
  primaryColor: "#E11D48",

  allowRegistration: true,
  requireEmailVerification: true,
  defaultRole: "STUDENT",
  maintenanceMode: false,

  emailFromName: "SkillForCareer",
  emailFromAddress: "",
  notifyOnEnrollment: true,
  notifyOnPayment: true,
  notifyOnNewUser: false,

  // The client's own signatories, from the certificates they already issue.
  certLeftName: "Sahil Bhatia",
  certLeftTitle: "Director",
  certLeftSignatureUrl: "",
  certRightName: "Amisha Chauhan",
  certRightTitle: "Program Manager",
  certRightSignatureUrl: "",

  lessonViewLimit: 0,
  lessonDownloadLimit: 0,
  quizAttemptLimit: 0,
  assignmentAttemptLimit: 0,

  emiEnabled: true,
  emiZeroCostEnabled: true,
  emiInterestPercent: 12,
  emiMaxInstallments: 12,

  chatbotEnabled: true,
  chatbotName: "Ami",
  chatbotGreeting:
    "Hi! I'm Ami, your SkillForCareer assistant. Ask me about courses, fees, batches or placements.",
  tourEnabled: true,
  voiceGuideEnabled: true,

  // Off until someone decides to switch it on.
  codingPracticeEnabled: false,
  codingPracticeUrl: "",
  codingPracticeAudience: "enrolled",

  socialWebsite: "",
  socialLinkedin: "",
  socialTwitter: "",
  socialInstagram: "",
  socialYoutube: "",
};
