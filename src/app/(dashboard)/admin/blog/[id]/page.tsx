import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getBlogPost } from "@/server/services/blog-service";
import { listCategories } from "@/server/services/category-service";
import { BlogEditor } from "@/components/admin/blog/blog-editor";

export const metadata: Metadata = { title: "Edit post" };
export const dynamic = "force-dynamic";

export default async function AdminBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const { id } = await params;

  const post = await getBlogPost(id).catch(() => null);
  if (!post) notFound();

  const categories = await listCategories();
  return (
    <BlogEditor
      post={post}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
