import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, needsRehash } from "@/lib/auth/password";
import { signAuthTokens, verifyToken } from "@/lib/auth/jwt";
import { hashRefreshToken } from "@/lib/auth/renew";
import { refreshTtlSeconds } from "@/lib/auth/duration";
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
import { ACTIVITY_ACTIONS, logActivity, recordLogin } from "./activity-service";

/** Public representation of a user — safe to send to the client. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  /**
   * The role this request acts as. It is the account's primary role, except
   * inside a panel the person reaches through an extra role (an instructor in
   * /student is a STUDENT there) — see `getCurrentUser` in lib/auth/require.
   */
  role: Role;
  /** Every role the person holds: the primary one first, then any extras. */
  roles: Role[];
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

/**
 * The signed-in user plus their effective permissions.
 *
 * This is the single hottest read in the app — every guarded page and API route
 * resolves it. `relationMode = "prisma"` means a nested `include` is *not* a
 * join: Prisma issues one query per relation level, so the obvious
 * `user → role → permissions → permission` include costs four sequential
 * round-trips (~800ms against TiDB in ap-southeast-1). The hand-written join
 * below does it in one (~180ms), which is why this path doesn't use `include`.
 */
interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: Date | string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
  status: string;
  role: Role;
  roles: Role[];
  permissions: string[];
}

interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: Date | string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
  status: string;
  roleSlug: string;
  extraRoleSlug: string | null;
  permissionKey: string | null;
}

/** Fold the join's one-row-per-permission result into a single user. */
function foldAuthUser(rows: AuthUserRow[]): AuthUser | null {
  const first = rows[0];
  if (!first) return null;
  return {
    id: first.id,
    name: first.name,
    email: first.email,
    emailVerified: first.emailVerified,
    passwordHash: first.passwordHash,
    avatarUrl: first.avatarUrl,
    status: first.status,
    role: first.roleSlug as Role,
    roles: [...new Set([first.roleSlug, ...rows.map((r) => r.extraRoleSlug).filter((k): k is string => k !== null)])] as Role[],
    // One row per (extra role × permission), so the same key can repeat.
    permissions: [...new Set(rows.map((r) => r.permissionKey).filter((k): k is string => k !== null))],
  };
}

async function loadAuthUserById(id: string): Promise<AuthUser | null> {
  return foldAuthUser(
    await prisma.$queryRaw<AuthUserRow[]>`
      SELECT u.id, u.name, u.email, u.emailVerified, u.passwordHash,
             u.avatarUrl, u.status, r.slug AS roleSlug, x.slug AS extraRoleSlug,
             p.\`key\` AS permissionKey
      FROM \`User\` u
      JOIN \`Role\` r ON r.id = u.roleId
      LEFT JOIN \`UserRole\` ur ON ur.userId = u.id
      LEFT JOIN \`Role\` x ON x.id = ur.roleId
      LEFT JOIN \`RolePermission\` rp ON rp.roleId = r.id OR rp.roleId = x.id
      LEFT JOIN \`Permission\` p ON p.id = rp.permissionId
      WHERE u.id = ${id}
    `,
  );
}

async function loadAuthUserByEmail(email: string): Promise<AuthUser | null> {
  return foldAuthUser(
    await prisma.$queryRaw<AuthUserRow[]>`
      SELECT u.id, u.name, u.email, u.emailVerified, u.passwordHash,
             u.avatarUrl, u.status, r.slug AS roleSlug, x.slug AS extraRoleSlug,
             p.\`key\` AS permissionKey
      FROM \`User\` u
      JOIN \`Role\` r ON r.id = u.roleId
      LEFT JOIN \`UserRole\` ur ON ur.userId = u.id
      LEFT JOIN \`Role\` x ON x.id = ur.roleId
      LEFT JOIN \`RolePermission\` rp ON rp.roleId = r.id OR rp.roleId = x.id
      LEFT JOIN \`Permission\` p ON p.id = rp.permissionId
      WHERE u.email = ${email}
    `,
  );
}

function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    status: user.status,
    roles: user.roles,
    permissions: user.permissions,
  };
}

/** Sign an access+refresh pair and persist the (hashed) refresh token. */
async function issueTokens(user: {
  id: string;
  email: string;
  role: Role;
}): Promise<AuthTokens> {
  const tokens = await signAuthTokens({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSeconds() * 1000),
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
  // Registration never needs the caller's permissions — a plain lookup is enough.
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, emailVerified: true },
  });
  if (existing?.emailVerified) {
    throw AppError.conflict("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  let user: { id: string; email: string; name: string };

  if (existing) {
    // Re-registration of an unverified account: refresh details.
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { name: input.name, passwordHash },
      select: { id: true, email: true, name: true },
    });
  } else {
    const studentRole = await prisma.role.findUnique({
      where: { slug: ROLES.STUDENT },
      select: { id: true },
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
      select: { id: true, email: true, name: true },
    });
  }

  const code = await createAndSendOtp(user.id, user.email, "verify-email", user.name);
  await emitEvent("user.registered", { userId: user.id, email: user.email });
  return { email: user.email, code };
}

/**
 * Express checkout identity — the "student ko pata bhi na chale aur sign up ho
 * jaaye" step on `/checkout/[slug]`.
 *
 * A visitor nobody has seen before is signed up and signed in on the spot: they
 * typed their name, email and phone into the buy form, and stopping them for an
 * inbox round-trip before they have paid is how carts are abandoned. The
 * account is created exactly as a counsellor-converted lead's is — ACTIVE, no
 * password — and they set one later from Forgot password.
 *
 * Anyone who *already* has an account has to prove it, because knowing an email
 * address is not a credential. With a password set, they type it; without one
 * (a lead the office converted), a code goes to that inbox. Either way the
 * caller stays on the checkout page — no redirect to /login, which was the
 * complaint that produced this flow.
 */
export type CheckoutIdentity =
  | { status: "SIGNED_IN"; user: PublicUser; tokens: AuthTokens; created: boolean }
  | { status: "PASSWORD_REQUIRED"; name: string; email: string }
  | { status: "CODE_SENT"; name: string; email: string; code: string };

/** Last ten digits — how phone numbers are matched everywhere in this app. */
function phoneKey(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM \`User\`
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 10) = ${key}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function identifyForCheckout(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<CheckoutIdentity> {
  const email = input.email.trim().toLowerCase();

  const byEmail = await loadAuthUserByEmail(email);
  const existingId = byEmail?.id ?? (await findUserIdByPhone(input.phone));

  if (existingId) {
    const user = byEmail ?? (await loadAuthUserById(existingId));
    if (!user) throw AppError.internal("Couldn't load that account.");
    if (user.status === "SUSPENDED") {
      throw AppError.forbidden("This account is suspended. Please contact support.");
    }
    if (user.passwordHash) {
      return { status: "PASSWORD_REQUIRED", name: user.name, email: user.email };
    }
    // No password on the account, so there is nothing to check against — a
    // code to the address on file is the proof.
    const code = await createAndSendOtp(user.id, user.email, "login", user.name);
    return { status: "CODE_SENT", name: user.name, email: user.email, code };
  }

  const studentRole = await prisma.role.findUnique({
    where: { slug: ROLES.STUDENT },
    select: { id: true },
  });
  if (!studentRole) {
    throw AppError.internal("Default role missing. Run `npm run db:seed`.");
  }
  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      phone: input.phone.trim() || null,
      roleId: studentRole.id,
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    select: { id: true },
  });

  const user = await loadAuthUserById(created.id);
  if (!user) throw AppError.internal("Couldn't create that account.");
  await emitEvent("user.registered", { userId: user.id, email: user.email });
  const tokens = await issueTokens(user);
  await recordLogin(user.id);
  return { status: "SIGNED_IN", user: toPublicUser(user), tokens, created: true };
}

/** Second half of the CODE_SENT branch above. */
export async function completeCheckoutOtp(input: {
  email: string;
  code: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = input.email.trim().toLowerCase();
  await consumeOtp(email, input.code, "login");
  const user = await loadAuthUserByEmail(email);
  if (!user) throw AppError.notFound("User not found.");
  const tokens = await issueTokens(user);
  await recordLogin(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function verifyEmailOtp(input: {
  email: string;
  code: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  await consumeOtp(input.email, input.code, "verify-email");

  await prisma.user.update({
    where: { email: input.email },
    data: { emailVerified: new Date(), status: "ACTIVE" },
    select: { id: true },
  });
  const updated = await loadAuthUserByEmail(input.email);
  if (!updated) throw AppError.notFound("User not found.");

  await emitEvent("user.verified", { userId: updated.id, email: updated.email });
  const tokens = await issueTokens(updated);
  await recordLogin(updated.id);
  return { user: toPublicUser(updated), tokens };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await loadAuthUserByEmail(input.email);
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

  // Accounts hashed at an older cost factor are upgraded on the way through —
  // folded into the lastLoginAt write, so it costs no extra round-trip.
  const upgradedHash = needsRehash(user.passwordHash)
    ? await hashPassword(input.password)
    : undefined;

  // Independent writes — the stamp doesn't gate the tokens. `touchLogin`
  // already writes lastLoginAt, so the tracking side only owes the audit row.
  const [, tokens] = await Promise.all([
    touchLogin(user.id, upgradedHash),
    issueTokens(user),
    logActivity({
      userId: user.id,
      action: ACTIVITY_ACTIONS.LOGIN,
      entityType: "User",
      entityId: user.id,
    }),
  ]);
  return { user: toPublicUser(user), tokens };
}

/**
 * Stamp `lastLoginAt` (and optionally rotate the password hash) in one statement.
 *
 * Deliberately raw. Under `relationMode = "prisma"` there are no real foreign
 * keys, so Prisma emulates referential integrity itself: a `user.update()` first
 * SELECTs from every one of the ~30 tables that reference `User` — even when the
 * update cannot possibly affect them, as here. Against a database a region away
 * that turned a single write into ~6s and made signing in feel broken.
 * Measured: 6088ms/33 queries via `update()` vs 276ms/1 query this way.
 */
async function touchLogin(userId: string, passwordHash?: string): Promise<void> {
  const now = new Date();
  if (passwordHash) {
    await prisma.$executeRaw`
      UPDATE \`User\` SET lastLoginAt = ${now}, passwordHash = ${passwordHash}, updatedAt = ${now}
      WHERE id = ${userId}
    `;
    return;
  }
  await prisma.$executeRaw`
    UPDATE \`User\` SET lastLoginAt = ${now}, updatedAt = ${now} WHERE id = ${userId}
  `;
}

/** A second sign-in code for the same address inside this window is not sent. */
const LOGIN_CODE_COOLDOWN_MS = 5 * 60_000;

/**
 * Email a one-time sign-in code — the "Email code" option on the apps'
 * sign-in screen, for anyone who has forgotten their password or never set
 * one. Says nothing about who has an account: an unknown or suspended address
 * gets the same answer and no email. A repeat request within five minutes is
 * ignored too (the code stays valid for ten), so the button can't be used to
 * flood someone's inbox.
 *
 * `code` is returned only for the caller to expose in development.
 */
export async function requestLoginCode(emailInput: string): Promise<{ email: string; code: string | null }> {
  const email = emailInput.trim().toLowerCase();
  const user = await loadAuthUserByEmail(email);
  if (!user || user.status === "SUSPENDED") return { email, code: null };

  const recent = await prisma.otpToken.findFirst({
    where: {
      email: user.email,
      purpose: PURPOSE_DB.login,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - LOGIN_CODE_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return { email, code: null };

  const code = await createAndSendOtp(user.id, user.email, "login", user.name);
  return { email, code };
}

/** The second step: the code from that email signs the person in, as a password would. */
export async function loginWithCode(input: {
  email: string;
  code: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = input.email.trim().toLowerCase();
  await consumeOtp(email, input.code, "login");
  let user = await loadAuthUserByEmail(email);
  if (!user) throw AppError.unauthorized("Invalid email or code.");
  if (user.status === "SUSPENDED") {
    throw AppError.forbidden("Your account has been suspended.");
  }

  // The code reached this inbox, which is exactly what verifying the address
  // proves — so an account still waiting on that is verified on the way in.
  // Raw for the same reason as `touchLogin` below.
  if (!user.emailVerified || user.status === "PENDING") {
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE \`User\`
      SET emailVerified = COALESCE(emailVerified, ${now}),
          status = IF(status = 'PENDING', 'ACTIVE', status),
          updatedAt = ${now}
      WHERE id = ${user.id}`;
    user = (await loadAuthUserById(user.id)) ?? user;
  }

  const [tokens] = await Promise.all([issueTokens(user), recordLogin(user.id)]);
  return { user: toPublicUser(user), tokens };
}

export async function resendOtp(input: {
  email: string;
  purpose: OtpPurpose;
}): Promise<{ email: string; code: string | null }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { email: input.email, code: null }; // avoid enumeration
  const code = await createAndSendOtp(user.id, user.email, input.purpose, user.name);
  return { email: user.email, code };
}

export async function forgotPassword(input: {
  email: string;
}): Promise<{ email: string; code: string | null }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true },
  });
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
    select: { id: true, email: true },
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
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }

  const user = await loadAuthUserById(payload.sub);
  if (!user) throw AppError.unauthorized("Session expired. Please sign in again.");

  // Rotate: revoke the used refresh token, issue a fresh pair.
  const [, tokens] = await Promise.all([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    issueTokens(user),
  ]);
  return { user: toPublicUser(user), tokens };
}

export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
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
  const user = await loadAuthUserById(userId);
  if (!user) throw AppError.notFound("User not found.");
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function getMe(userId: string): Promise<PublicUser | null> {
  const user = await loadAuthUserById(userId);
  return user ? toPublicUser(user) : null;
}

/** How long an app-to-website sign-in link stays usable. */
const HANDOFF_TTL_MS = 2 * 60_000;

/**
 * A one-time link that signs the app's user into the website — how an admin,
 * instructor or sales agent opens their panel from the phone app without
 * typing their password again. The link carries a long random code stored
 * hashed as a LOGIN code, good for one use within two minutes.
 *
 * The row is inserted directly rather than through `createAndSendOtp`: that
 * would email the code and clear any code the person asked for by email.
 */
export async function createWebHandoff(userId: string): Promise<{ email: string; code: string }> {
  const user = await loadAuthUserById(userId);
  if (!user || user.status === "SUSPENDED") throw AppError.unauthorized("Please sign in again.");
  const code = randomBytes(24).toString("base64url");
  await prisma.otpToken.create({
    data: {
      userId: user.id,
      email: user.email,
      codeHash: hashOtp(code),
      purpose: PURPOSE_DB.login,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    },
  });
  return { email: user.email, code };
}

/** Spend a handoff code: exactly one use, before it expires, for that address. */
export async function redeemWebHandoff(emailInput: string, code: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = emailInput.trim().toLowerCase();
  const record = await prisma.otpToken.findFirst({
    where: { email, purpose: PURPOSE_DB.login, codeHash: hashOtp(code), consumedAt: null },
    select: { id: true, expiresAt: true },
  });
  if (!record || record.expiresAt < new Date()) {
    throw AppError.unauthorized("This sign-in link has expired. Open it again from the app.");
  }
  await prisma.otpToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  const user = await loadAuthUserByEmail(email);
  if (!user || user.status === "SUSPENDED") throw AppError.unauthorized("Please sign in again.");
  const [tokens] = await Promise.all([issueTokens(user), recordLogin(user.id)]);
  return { user: toPublicUser(user), tokens };
}
