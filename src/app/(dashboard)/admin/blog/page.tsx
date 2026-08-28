import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listBlogPosts } from "@/server/services/blog-service";
import { BlogClient } from "@/components/admin/blog/blog-client";

export const metadata: Metadata = { title: "Blog" };
export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const page = await listBlogPosts({ page: 1, pageSize: 20 });
  return <BlogClient initial={page} />;
}
