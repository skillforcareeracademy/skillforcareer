import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import type {
  ListUsersQuery,
  UpdateUserAdminInput,
  CreateUserAdminInput,
} from "@/lib/validations/user";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  role: string;
  roleLabel: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserListResult {
  users: UserRow[];
  total: number;
}

export async function listUsers(q: ListUsersQuery): Promise<UserListResult> {
  const and: Prisma.UserWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search } },
        { email: { contains: q.search } },
      ],
    });
  }
  if (q.role) and.push({ role: { slug: q.role } });
  if (q.status) {
    and.push({ status: q.status as Prisma.UserWhereInput["status"] });
  }
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return {
    total,
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      status: u.status,
      role: u.role.slug,
      roleLabel: u.role.name,
      emailVerified: Boolean(u.emailVerified),
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

/** Create a new account from the admin console. Admin-created users are
 *  pre-verified (they skip the email-OTP flow) and default to ACTIVE. */
export async function createUserAdmin(
  input: CreateUserAdminInput,
): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw AppError.conflict("A user with this email already exists.");

  const role = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
  if (!role) throw AppError.badRequest("Unknown role.");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      roleId: role.id,
      status: input.status as Prisma.UserUncheckedCreateInput["status"],
      // Admin-provisioned accounts are trusted — no verification email needed.
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  return user;
}

export async function updateUserAdmin(
  id: string,
  input: UpdateUserAdminInput,
): Promise<void> {
  const data: Prisma.UserUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw AppError.conflict("Another user already uses this email.");
    data.email = input.email;
  }
  if (input.status) {
    data.status = input.status as Prisma.UserUncheckedUpdateInput["status"];
  }
  if (input.roleSlug) {
    const role = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
    if (!role) throw AppError.badRequest("Unknown role.");
    data.roleId = role.id;
  }
  await prisma.user.update({ where: { id }, data });
}

/** Minimal lookup for the impersonation guard (id, display name, role slug). */
export async function getUserForImpersonation(
  id: string,
): Promise<{ id: string; name: string; role: string } | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: { select: { slug: true } } },
  });
  return u ? { id: u.id, name: u.name, role: u.role.slug } : null;
}

export async function deleteUserAdmin(
  id: string,
  actingUserId: string,
): Promise<void> {
  if (id === actingUserId) {
    throw AppError.badRequest("You can't delete your own account.");
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw AppError.notFound("User not found.");
  await prisma.user.delete({ where: { id } });
}

/** All users matching a filter, flattened for CSV export (no pagination). */
export async function usersForExport(q: ListUsersQuery) {
  const and: Prisma.UserWhereInput[] = [];
  if (q.search) and.push({ OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] });
  if (q.role) and.push({ role: { slug: q.role } });
  if (q.status) and.push({ status: q.status as Prisma.UserWhereInput["status"] });
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { role: { select: { name: true } } },
  });
  const headers = ["Name", "Email", "Phone", "Role", "Status", "Email verified", "Joined"];
  const data = rows.map((u) => [
    u.name,
    u.email,
    u.phone ?? "",
    u.role.name,
    u.status,
    u.emailVerified ? "Yes" : "No",
    u.createdAt.toISOString().slice(0, 10),
  ]);
  return { headers, data };
}
