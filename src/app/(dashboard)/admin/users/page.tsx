import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listUsersQuerySchema } from "@/lib/validations/user";
import { listUsers } from "@/server/services/user-service";
import { UsersClient } from "@/components/admin/users/users-client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = listUsersQuerySchema.parse(sp);
  const { users, total } = await listUsers(query);
  return <UsersClient users={users} total={total} query={query} />;
}
