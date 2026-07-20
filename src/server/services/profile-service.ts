import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/api/errors";
import type { UpdateProfileInput } from "@/lib/validations/profile";

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string;
  locale: string;
  roleLabel: string;
  emailVerified: boolean;
  status: string;
  createdAt: string;
}

export async function getProfile(userId: string): Promise<Profile> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { name: true } } },
  });
  if (!u) throw AppError.notFound("Account not found.");

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    headline: u.headline,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    timezone: u.timezone,
    locale: u.locale,
    roleLabel: u.role.name,
    emailVerified: Boolean(u.emailVerified),
    status: u.status,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      phone: input.phone || null,
      headline: input.headline || null,
      bio: input.bio || null,
      avatarUrl: input.avatarUrl || null,
      timezone: input.timezone || "Asia/Kolkata",
      locale: input.locale || "en",
    },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!u?.passwordHash) {
    throw AppError.badRequest("This account has no password set.");
  }
  const valid = await verifyPassword(currentPassword, u.passwordHash);
  if (!valid) throw AppError.badRequest("Your current password is incorrect.");

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}
