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
  .refine(
    (v) => v === "" || z.string().email().safeParse(v).success,
    "Enter a valid email",
  )
  .or(z.literal(""));

/**
 * Google's three site-wide identifiers, typed in by the academy itself.
 *
 * Nobody pastes the bare id. Search Console hands out a whole
 * `<meta name="google-site-verification" content="…">` tag, Tag Manager a whole
 * `<script>` block, and Analytics shows the id inside a snippet. Rather than
 * asking an admin to edit what Google gave them, each field digs its own id out
 * of whatever was pasted and stores just that. Blank is how a tag is turned off.
 *
 * The patterns are exported because the values end up inside an inline
 * `<script>` on the public site: `tracking-service.ts` re-checks them on the way
 * out, so nothing but an id Google could have issued can ever reach the page.
 */
export const GTM_PATTERN = /^GTM-[A-Z0-9]{4,12}$/;
export const GA_PATTERN = /^(?:G-[A-Z0-9]{6,14}|UA-\d{4,10}-\d{1,4})$/;
/** Google's token is URL-safe base64; the length has drifted over the years. */
export const SITE_VERIFICATION_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

/** Takes the first thing in `raw` that looks like an id, else `raw` itself. */
function extract(raw: string, find: RegExp): string {
  return (raw.match(find)?.[0] ?? raw).trim().toUpperCase();
}

const gtmContainer = z
  .string()
  .trim()
  .max(400)
  .transform((v) => extract(v, /GTM-[A-Z0-9]+/i))
  .refine(
    (v) => v === "" || GTM_PATTERN.test(v),
    "Enter a container ID like GTM-ABC1234, or paste the snippet Tag Manager gave you",
  );

const gaMeasurement = z
  .string()
  .trim()
  .max(400)
  .transform((v) => extract(v, /\b(?:G-[A-Z0-9]+|UA-\d+-\d+)\b/i))
  .refine(
    (v) => v === "" || GA_PATTERN.test(v),
    "Enter a measurement ID like G-ABCD123456, or paste the snippet Analytics gave you",
  );

const siteVerification = z
  .string()
  .trim()
  .max(400)
  // A pasted meta tag carries the token in `content="…"`; anything else is
  // already the token. Case is preserved here — unlike an id, it matters.
  .transform((v) => (v.match(/content=["']([^"']+)["']/i)?.[1] ?? v).trim())
  .refine(
    (v) => v === "" || SITE_VERIFICATION_PATTERN.test(v),
    "Paste the verification code, or the whole meta tag Search Console gave you",
  );

export const settingsSchema = z.object({
  // ── General ──────────────────────────────────────────────────────────────
  siteName: z.string().trim().min(1, "Site name is required").max(80),
  tagline: z.string().trim().max(160),
  supportEmail: optionalEmail,
  contactPhone: z.string().trim().max(30),
  /** Where the site's WhatsApp buttons go. Blank falls back to the phone above. */
  whatsappNumber: z.string().trim().max(30),

  // ── Localization ─────────────────────────────────────────────────────────
  defaultTimezone: z.string().trim().max(60),
  defaultLocale: z.string().trim().max(10),
  currency: z.string().trim().min(1).max(6),

  // ── Branding ─────────────────────────────────────────────────────────────
  logoUrl: z.string().trim().max(500),
  /** Used wherever the chrome is dark — the live class room, mainly. */
  logoDarkUrl: z.string().trim().max(500),
  faviconUrl: z.string().trim().max(500),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #E11D48"),

  // ── Refer and earn ───────────────────────────────────────────────────────
  /** The whole programme. Off hides the codes and pays nothing out. */
  referralEnabled: z.boolean(),
  /** What a learner earns when someone they referred pays for a seat. */
  referralRewardAmount: z.coerce.number().int().min(0).max(1_000_000),
  /** What the referred friend gets off their first enrolment. 0 = no discount. */
  referralDiscountAmount: z.coerce.number().int().min(0).max(1_000_000),
  /** What a referral on the birthday code pays. 0 = no birthday code at all. */
  birthdayReferralReward: z.coerce.number().int().min(0).max(1_000_000),
  /** How long the birthday code lasts, in days. 1 = the birthday only. */
  birthdayCodeDays: z.coerce.number().int().min(1).max(30),
  /** Below this, a withdrawal can't be asked for. 0 = any amount. */
  walletMinWithdrawal: z.coerce.number().int().min(0).max(1_000_000),
  /** Off, learners see their balance but can't ask for a payout. */
  walletWithdrawalsEnabled: z.boolean(),

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
  /// Days after a due date before an instalment counts as late. The office
  /// asked for "an option to add grace period from the payment date".
  feeGraceDays: z.coerce.number().int().min(0).max(90),
  /// What a late instalment is charged — "penalty of 10% penalty would be
  /// charged. We can also edit that penalty percentage or amount." A flat
  /// figure wins over the percentage when it is set.
  ///
  /// Ships at zero on purpose. Charging is not retrospective-aware: the first
  /// sweep after a rate is set charges *every* instalment already past its
  /// grace period, which on an academy with historical dues means late fees
  /// appearing against learners nobody warned. Typing a rate is the academy
  /// saying it means to do that.
  feePenaltyPercent: z.coerce.number().min(0).max(100),
  feePenaltyFlat: z.coerce.number().min(0).max(1_000_000),
  /// Whether the scheduled nudges go out at all — 7 days, 3 days, 1 day and
  /// 2 hours before a due date, then an overdue notice after it.
  ///
  /// Ships **off**. The sweep has no idea which of an academy's historical dues
  /// are real: the first run after this was switched on emailed a learner about
  /// an instalment the office had already settled, and he replied to say so.
  /// Turning it on is the academy saying its fee records are right.
  feeRemindersEnabled: z.boolean(),
  /// The small print shown with a learner's fees, one rule per line. The
  /// academy writes it — "mujhe dynamic krke de dena terms and conditions and
  /// support details Mai khud se change kr saku and wo student ko reflect ho
  /// jaayein" — so nothing here is hard-coded into the page.
  feeTerms: z.string().trim().max(4000),
  /// Who to contact about a fee, shown under those terms. Blank falls back to
  /// the support email and phone set at the top of Settings.
  feeSupportEmail: z.string().trim().max(120),
  feeSupportPhone: z.string().trim().max(40),
  feeSupportSite: z.string().trim().max(160),

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

  // ── Google integrations ──────────────────────────────────────────────────
  // Filled in from Admin > Settings > Integrations, and rendered on every page
  // of the public site. Each is independent and blank means "not connected".
  /** The code Search Console asks you to put on the site to prove it's yours. */
  googleSiteVerification: siteVerification,
  /** GA4 measurement ID. Loads gtag.js directly, no Tag Manager needed. */
  gaMeasurementId: gaMeasurement,
  /** Tag Manager container. Anything set up inside GTM then runs on the site. */
  gtmContainerId: gtmContainer,

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
  whatsappNumber: "",

  defaultTimezone: "Asia/Kolkata",
  defaultLocale: "en",
  currency: "INR",

  // The client's own brand assets, bundled so a fresh install is on-brand
  // before anything is uploaded. Admin > Settings > Branding overrides these.
  logoUrl: "/images/brand/logo.png",
  logoDarkUrl: "",
  faviconUrl: "/images/brand/favicon.png",
  primaryColor: "#E11D48",

  referralEnabled: true,
  referralRewardAmount: 5000,
  referralDiscountAmount: 0,
  birthdayReferralReward: 5000,
  birthdayCodeDays: 1,
  walletMinWithdrawal: 500,
  walletWithdrawalsEnabled: true,
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
  feeGraceDays: 5,
  feePenaltyPercent: 0,
  feePenaltyFlat: 0,
  feeRemindersEnabled: false,
  // The academy's own words, as it dictated them. Editable in Settings → Fees.
  feeTerms: [
    "Fees once paid are non-refundable.",
    "Always collect your receipt. A payment without a receipt is treated as not received.",
    "Classes may be paused or stopped if a payment is in default.",
    "Printouts of books are chargeable separately and are not part of the course fee.",
    "A penalty is charged on delayed payments, as set out in your instalment plan.",
  ].join("\n"),
  feeSupportEmail: "info@skillforcareer.com",
  feeSupportPhone: "922-0402-922",
  feeSupportSite: "www.skillforcareer.com",

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

  googleSiteVerification: "",
  gaMeasurementId: "",
  gtmContainerId: "",

  socialWebsite: "",
  socialLinkedin: "",
  socialTwitter: "",
  socialInstagram: "",
  socialYoutube: "",
};
