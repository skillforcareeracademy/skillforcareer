import { z } from "zod";

/**
 * A company the platform is sold to — "tenant wise banna hai, hum kisi bhi
 * company ko share kar sakte".
 */

export const COMPANY_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

/** Blank means "no limit"; zero forbids the kind outright. */
const seats = z.coerce.number().int().min(0).max(100_000).optional();

export const companySchema = z.object({
  name: z.string().trim().min(2, "Give the company a name").max(120),
  status: z.enum(COMPANY_STATUSES).default("ACTIVE"),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(512).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),

  /** What an invoice to this company needs on it. */
  addressLine: z.string().trim().max(255).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  postcode: z.string().trim().max(20).optional().or(z.literal("")),
  gstNumber: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(v.toUpperCase()),
      "That doesn't look like a GSTIN (15 characters, e.g. 29ABCDE1234F1Z5)",
    ),
  billingEmail: z.string().trim().max(160).optional().or(z.literal("")),

  plan: z.string().trim().max(60).optional().or(z.literal("")),
  subscriptionEndsAt: z.string().trim().max(40).optional().or(z.literal("")),

  maxStudents: seats,
  maxInstructors: seats,
  maxAdmins: seats,
  maxSalesAgents: seats,

  /**
   * The company's own payment gateway, so an enrolment from their website is
   * paid to them. The secret is write-only: blank means "leave it as it is",
   * because the form is never sent the stored one back.
   */
  razorpayKeyId: z.string().trim().max(80).optional().or(z.literal("")),
  razorpayKeySecret: z.string().trim().max(200).optional().or(z.literal("")),

  /** Their own WhatsApp Business and sending address, for broadcasting. */
  whatsappPhoneId: z.string().trim().max(60).optional().or(z.literal("")),
  whatsappToken: z.string().trim().max(600).optional().or(z.literal("")),
  senderEmail: z.string().trim().max(160).optional().or(z.literal("")),
});

export type CompanyInput = z.infer<typeof companySchema>;
