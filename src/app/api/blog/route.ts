import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { blogPostSchema, listBlogQuerySchema } from "@/lib/validations/blog";
import { createBlogPost, listBlogPosts } from "@/server/services/blog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const sp = new URL(req.url).searchParams;
  const query = listBlogQuerySchema.parse(Object.fromEntries(sp));
  return ok(await listBlogPosts(query));
});

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const input = blogPostSchema.parse(await req.json().catch(() => ({})));
  const id = await createBlogPost(input, user.id);
  return created({ id, message: "Post created." });
});
