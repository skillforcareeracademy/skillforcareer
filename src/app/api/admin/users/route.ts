import { withRoute } from "@/lib/api/handler";
import { paginated, buildPaginationMeta, created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  listUsersQuerySchema,
  createUserAdminSchema,
} from "@/lib/validations/user";
import { listUsers, createUserAdmin } from "@/server/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const url = new URL(req.url);
  const q = listUsersQuerySchema.parse(Object.fromEntries(url.searchParams));
  const { users, total } = await listUsers(q);
  return paginated(users, buildPaginationMeta(q.page, q.pageSize, total));
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const input = createUserAdminSchema.parse(await req.json().catch(() => ({})));
  const user = await createUserAdmin(input);
  return created({ id: user.id, message: "User created." });
});
