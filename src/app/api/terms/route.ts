import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiUser, requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { ROLES } from "@/config/roles";
import { termListSchema, termSchema } from "@/lib/validations/term";
import { createTerm, listTerms, termCounts } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isStaff = (roles: string[]) =>
  roles.some(
    (r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN || r === ROLES.INSTRUCTOR,
  );

/** The dictionary. Learners see only what has been published. */
export const GET = withRoute(async (req) => {
  const user = await requireApiUser();
  const sp = new URL(req.url).searchParams;
  const q = termListSchema.parse(Object.fromEntries(sp.entries()));
  const publishedOnly = !isStaff(user.roles);
  const [list, counts] = await Promise.all([
    listTerms(q, user.id, publishedOnly),
    termCounts(publishedOnly),
  ]);
  return ok({ ...list, counts });
});

/** Add a word. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const input = termSchema.parse(await req.json().catch(() => ({})));
  const id = await createTerm(input, user.id);
  return created({ id, message: `“${input.word}” added.` });
});
