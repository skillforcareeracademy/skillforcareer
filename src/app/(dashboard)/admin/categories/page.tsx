import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCategories } from "@/server/services/category-service";
import { CategoriesClient } from "@/components/admin/categories/categories-client";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const categories = await listCategories();
  return <CategoriesClient initial={categories} />;
}
