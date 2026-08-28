import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { blogPostSchema } from "@/lib/validations/blog";
import {
  deleteBlogPost,
  getBlogPost,
  updateBlogPost,
} from "@/server/services/blog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  return ok(await getBlogPost(String((await params).id)));
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const input = blogPostSchema.parse(await req.json().catch(() => ({})));
  await updateBlogPost(String((await params).id), input);
  return ok({ message: "Post saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  await deleteBlogPost(String((await params).id));
  return ok({ message: "Post deleted." });
});
