import { z } from "zod";

/**
 * Sending an announcement: "Message broadcast krne ka system from admin panel
 * and instructor panel for students for some urgent changes and schedule change
 * or any change."
 */

export const BROADCAST_AUDIENCES = [
  "ROLES",
  "BATCHES",
  "COURSES",
  "USERS",
  "ALL_USERS",
  "PLACEMENT_PARTNERS",
  "HIRING_PARTNERS",
  "PLACEMENT_CANDIDATES",
] as const;

export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/** What the composer calls each audience. */
export const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  ROLES: "By role",
  BATCHES: "By batch",
  COURSES: "By course",
  USERS: "Chosen people",
  ALL_USERS: "Everyone with an account",
  PLACEMENT_PARTNERS: "Placement partners",
  HIRING_PARTNERS: "Hiring partners",
  PLACEMENT_CANDIDATES: "Placement candidates",
};

/** Audiences that need at least one id picked before they mean anything. */
export const AUDIENCES_NEEDING_TARGETS: BroadcastAudience[] = [
  "ROLES",
  "BATCHES",
  "COURSES",
  "USERS",
];

/**
 * Audiences that are not platform users: companies and applicants we hold an
 * email for and nothing else. They can be emailed but have no dashboard to
 * show a bell notification in.
 */
export const EMAIL_ONLY_AUDIENCES: BroadcastAudience[] = [
  "PLACEMENT_PARTNERS",
  "HIRING_PARTNERS",
];

/** What an instructor may send to — their own teaching, and nobody else's. */
export const INSTRUCTOR_AUDIENCES: BroadcastAudience[] = ["BATCHES", "COURSES", "USERS"];

export const sendBroadcastSchema = z
  .object({
    title: z.string().trim().min(1, "Give the message a subject").max(150),
    message: z.string().trim().min(1, "Write the message").max(20_000),
    actionUrl: z.string().trim().max(500).optional().or(z.literal("")),
    audience: z.enum(BROADCAST_AUDIENCES),
    targetIds: z.array(z.string().min(1)).max(5000).default([]),
    toDashboard: z.boolean().default(true),
    toEmail: z.boolean().default(false),
    /** A notice or timetable to send with it. */
    fileUrl: z.string().trim().max(500).optional().or(z.literal("")),
    fileName: z.string().trim().max(160).optional().or(z.literal("")),
    /** Written now, sent later. A draft reaches nobody. */
    isDraft: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // A draft is a note to self: it need not say where it is going yet.
    if (v.isDraft) return;
    if (!v.toDashboard && !v.toEmail) {
      ctx.addIssue({
        code: "custom",
        message: "Choose where it goes — the dashboard, email, or both.",
        path: ["toDashboard"],
      });
    }
    if (AUDIENCES_NEEDING_TARGETS.includes(v.audience) && v.targetIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Pick at least one before sending.",
        path: ["targetIds"],
      });
    }
    // A company has no account to sign in to, so a bell notification would
    // reach nobody. Say so here rather than silently sending nothing.
    if (EMAIL_ONLY_AUDIENCES.includes(v.audience) && !v.toEmail) {
      ctx.addIssue({
        code: "custom",
        message: "Partners have no dashboard — tick email to reach them.",
        path: ["toEmail"],
      });
    }
  });

export type SendBroadcastInput = z.infer<typeof sendBroadcastSchema>;

/** Counting an audience before sending to it. */
export const previewAudienceSchema = z.object({
  audience: z.enum(BROADCAST_AUDIENCES),
  targetIds: z.array(z.string().min(1)).max(5000).default([]),
});

export type PreviewAudienceInput = z.infer<typeof previewAudienceSchema>;
