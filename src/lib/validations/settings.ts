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

  socialWebsite: "",
  socialLinkedin: "",
  socialTwitter: "",
  socialInstagram: "",
  socialYoutube: "",
};
