import { z } from "zod";

export const CERTIFICATE_STATUSES = ["ISSUED", "REVOKED"] as const;
export const CERTIFICATE_STATUS_LABEL: Record<string, string> = {
  ISSUED: "Issued",
  REVOKED: "Revoked",
};

export const issueCertificateSchema = z.object({
  userId: z.string().min(1, "Choose a learner"),
  courseId: z.string().min(1, "Choose a course"),
});

export const setCertificateStatusSchema = z.object({
  status: z.enum(CERTIFICATE_STATUSES),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
