import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { CategoryInput } from "@/lib/validations/category";
import { invalidateHeaderMenus } from "./header-menu-service";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  order: number;
  isActive: boolean;
  parentId: string | null;
  parentName: string | null;
  courseCount: number;
  childCount: number;
  createdAt: string;
}

export async function listCategories(): Promise<CategoryRow[]> {
  const cats = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { courses: true, children: true } },
    },
  });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon: c.icon,
    order: c.order,
    isActive: c.isActive,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    courseCount: c._count.courses,
    childCount: c._count.children,
    createdAt: c.createdAt.toISOString(),
  }));
}

/**
 * Active categories that actually have something published behind them, with a
 * count the public can trust — `listCategories` counts drafts too, which would
 * advertise tracks a visitor cannot open.
 */
export async function listPublicCategories() {
  const [cats, counts] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, description: true },
    }),
    prisma.course.groupBy({
      by: ["categoryId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
  ]);

  const published = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return cats
    .map((c) => ({ ...c, courseCount: published.get(c.id) ?? 0 }))
    .filter((c) => c.courseCount > 0);
}

export async function createCategory(input: CategoryInput): Promise<void> {
  const slug = input.slug && input.slug.length ? input.slug : slugify(input.name);
  const data: Prisma.CategoryUncheckedCreateInput = {
    name: input.name,
    slug,
    description: input.description || null,
    icon: input.icon || null,
    order: input.order ?? 0,
    isActive: input.isActive ?? true,
    parentId: input.parentId || null,
  };
  try {
    await prisma.category.create({ data });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw AppError.conflict("That slug is already in use.");
    }
    throw e;
  }
  // The header's Categories dropdown is built from this table.
  invalidateHeaderMenus();
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<void> {
  const slug = input.slug && input.slug.length ? input.slug : slugify(input.name);
  if (input.parentId === id) {
    throw AppError.badRequest("A category cannot be its own parent.");
  }
  const data: Prisma.CategoryUncheckedUpdateInput = {
    name: input.name,
    slug,
    description: input.description || null,
    icon: input.icon || null,
    order: input.order ?? 0,
    isActive: input.isActive ?? true,
    parentId: input.parentId || null,
  };
  try {
    await prisma.category.update({ where: { id }, data });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw AppError.conflict("That slug is already in use.");
    }
    throw e;
  }
  invalidateHeaderMenus();
}

export async function deleteCategory(id: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { courses: true, children: true } } },
  });
  if (!cat) throw AppError.notFound("Category not found.");
  if (cat._count.courses > 0) {
    throw AppError.conflict("Reassign this category's courses before deleting it.");
  }
  if (cat._count.children > 0) {
    throw AppError.conflict("Delete or move its sub-categories first.");
  }
  await prisma.category.delete({ where: { id } });
  invalidateHeaderMenus();
}
