import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signAuthTokens, verifyToken } from "@/lib/auth/jwt";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiresAt,
  otpExpiryMinutes,
  otpMaxAttempts,
} from "@/lib/auth/otp";
import { sendMail } from "@/lib/mail/mailer";
import { otpEmail, type OtpPurpose } from "@/lib/mail/templates/otp";
import { emitEvent } from "@/lib/events";
import { AppError } from "@/lib/api/errors";
import { ROLES, type Role } from "@/config/roles";

/** Public representation of a user — safe to send to the client. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  status: string;
  permissions: string[];
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// zod purpose (kebab) ⇄ Prisma OtpPurpose enum
const PURPOSE_DB = {
  "verify-email": "VERIFY_EMAIL",
  "reset-password": "RESET_PASSWORD",
  login: "LOGIN",
} as const;

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
} as const;

type UserWithRole = NonNullable<
  Awaited<ReturnType<typeof findUserByEmail>>
>;

function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, include: userInclude });
}

function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: userInclude });
}

function toPublicUser(user: UserWithRole): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.slug as Role,
    avatarUrl: user.avatarUrl,
    status: user.status,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseDurationMs(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
  return n * unit;
}

/** Sign an access+refresh pair and persist the (hashed) refresh token. */
async function issueTokens(user: UserWithRole): Promise<AuthTokens> {
  const tokens = await signAuthTokens({
    sub: user.id,
    email: user.email,
    role: user.role.slug as Role,
  });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(tokens.refreshToken),
      expiresAt: new Date(
        Date.now() +
          parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"),
      ),
    },
  });
  return tokens;
}

/** Create a fresh OTP for a purpose, email it, and return the plaintext code. */
async function createAndSendOtp(
  userId: string | null,
  email: string,
  purpose: OtpPurpose,
  name?: string,
): Promise<string> {
  const purposeDb = PURPOSE_DB[purpose];
  // Invalidate any previous unconsumed codes for this email+purpose.
  await prisma.otpToken.deleteMany({
    where: { email, purpose: purposeDb, consumedAt: null },
  });

  const code = generateOtp();
  await prisma.otpToken.create({
    data: {
      userId,
      email,
      codeHash: hashOtp(code),
      purpose: purposeDb,
      expiresAt: otpExpiresAt(),
    },
  });

  const mail = otpEmail({ code, purpose, expiryMinutes: otpExpiryMinutes(), name });
  await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  return code;
}

/** Validate + consume the latest OTP for an email/purpose. Returns the userId. */
async function consumeOtp(
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<string | null> {
  const record = await prisma.otpToken.findFirst({
    where: { email, purpose: PURPOSE_DB[purpose], consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw AppError.badRequest("No active code. Please request a new one.");
  }
  if (record.expiresAt < new Date()) {
    throw AppError.badRequest("This code has expired. Please request a new one.");
  }
  if (record.attempts >= otpMaxAttempts()) {
    throw AppError.badRequest("Too many attempts. Please request a new code.");
  }
  if (!verifyOtp(code, record.codeHash)) {
    await prisma.otpToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw AppError.badRequest("Invalid code. Please try again.");
  }

  await prisma.otpToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return record.userId;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ email: string; code: string }> {
  const existing = await findUserByEmail(input.email);
  if (existing?.emailVerified) {
    throw AppError.conflict("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  let user: UserWithRole;

  if (existing) {
    // Re-registration of an unverified account: refresh details.
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { name: input.name, passwordHash },
      include: userInclude,
    });
  } else {
    const studentRole = await prisma.role.findUnique({
      where: { slug: ROLES.STUDENT },
    });
    if (!studentRole) {
      throw AppError.internal("Default role missing. Run `npm run db:seed`.");
    }
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        roleId: studentRole.id,
        status: "PENDING",
      },
      include: userInclude,
    });
  }

  const code = await createAndSendOtp(user.id, user.email, "verify-email", user.name);
  await emitEvent("user.registered", { userId: user.id, email: user.email });
  return { email: user.email, code };
}

export async function verifyEmailOtp(input: {
  email: string;
  code: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  await consumeOtp(input.email, input.code, "verify-email");

  const updated = await prisma.user.update({
    where: { email: input.email },
    data: { emailVerified: new Date(), status: "ACTIVE" },
    include: userInclude,
  });

  await emitEvent("user.verified", { userId: updated.id, email: updated.email });
  const tokens = await issueTokens(updated);
  return { user: toPublicUser(updated), tokens };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await findUserByEmail(input.email);
  if (!user || !user.passwordHash) {
    throw AppError.unauthorized("Invalid email or password.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password.");
  }

  if (!user.emailVerified || user.status === "PENDING") {
    throw new AppError("FORBIDDEN", "Please verify your email to continue.", {
      reason: "EMAIL_NOT_VERIFIED",
      email: user.email,
    });
  }
  if (user.status === "SUSPENDED") {
    throw AppError.forbidden("Your account has been suspended.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function resendOtp(input: {
  email: string;
  purpose: OtpPurpose;
}): Promise<{ email: string; code: string | null }> {
  const user = await findUserByEmail(input.email);
  if (!user) return { email: input.email, code: null }; // avoid enumeration
  const code = await createAndSendOtp(user.id, user.email, input.purpose, user.name);
  return { email: user.email, code };
}

export async function forgotPassword(input: {
  email: string;
}): Promise<{ email: string; code: string | null }> {
  const user = await findUserByEmail(input.email);
  if (!user) return { email: input.email, code: null }; // avoid enumeration
  const code = await createAndSendOtp(user.id, user.email, "reset-password", user.name);
  return { email: user.email, code };
}

export async function resetPassword(input: {
  email: string;
  code: string;
  password: string;
}): Promise<{ email: string }> {
  await consumeOtp(input.email, input.code, "reset-password");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.update({
    where: { email: input.email },
    data: {
      passwordHash,
      // A verified email is implied by a successful reset.
      emailVerified: new Date(),
      status: "ACTIVE",
    },
  });

  // Invalidate every existing session — force re-login with the new password.
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { email: user.email };
}

export async function refresh(
  refreshToken: string,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(refreshToken, "refresh");
  } catch {
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: userInclude,
  });
  if (!user) throw AppError.unauthorized("Session expired. Please sign in again.");

  // Rotate: revoke the used refresh token, issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Issue a fresh access+refresh session for a user by id, without a password
 * check. Used by admin impersonation ("secret login") and the return flow —
 * callers MUST authorize before invoking this.
 */
export async function issueSessionFor(
  userId: string,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await findUserById(userId);
  if (!user) throw AppError.notFound("User not found.");
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function getMe(userId: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userInclude,
  });
  return user ? toPublicUser(user) : null;
}
