import { z } from "zod";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export const LEAD_SOURCES = ["WEBSITE", "MANUAL", "REFERRAL", "PHONE", "WALK_IN", "SOCIAL"] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  MANUAL: "Manual",
  REFERRAL: "Referral",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  SOCIAL: "Social",
};

/** Public website enquiry form. */
export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(6, "Enter a valid phone").max(20),
  courseInterest: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Admin manual lead creation. */
export const createLeadSchema = enquirySchema.extend({
  source: z.enum(LEAD_SOURCES).default("MANUAL"),
});

export const updateLeadSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  assignedToId: z.string().optional().or(z.literal("")),
});

export const followUpSchema = z.object({
  note: z.string().trim().min(1, "Add a remark").max(2000),
  status: z.enum(LEAD_STATUSES).optional(),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;
