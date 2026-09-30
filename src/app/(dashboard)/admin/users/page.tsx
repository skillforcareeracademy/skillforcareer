import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { prisma } from "@/lib/prisma";
import { listUsersQuerySchema } from "@/lib/validations/user";
import { listUsers } from "@/server/services/user-service";
import { UsersClient } from "@/components/admin/users/users-client";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = listUsersQuerySchema.parse(sp);

  const [{ users, total }, courses, batches] = await Promise.all([
    listUsers(query),
    prisma.course.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 300,
    }),
    prisma.batch.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <UsersClient
      users={users}
      total={total}
      query={query}
      courses={courses}
      batches={batches}
    />
  );
}
