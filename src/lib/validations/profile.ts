import { z } from "zod";
import { passwordSchema } from "./auth";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  headline: z.string().trim().max(120).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  // Accepts an uploaded path (/api/files/…) or an external URL.
  avatarUrl: z.string().trim().max(500).optional().or(z.literal("")),
  timezone: z.string().trim().max(60).optional().or(z.literal("")),
  locale: z.string().trim().max(10).optional().or(z.literal("")),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
