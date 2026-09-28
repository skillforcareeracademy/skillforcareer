import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { MaterialCategoryInput } from "@/lib/validations/study-material";

/**
 * Study-material grouping — a category and, under it, sub-categories.
 *
 * The same two-level model as quiz grouping, for the same reason: the academy
 * files its reading by subject, not by what it sells. A name is unique within
 * its parent, enforced here rather than by an index, because TiDB won't take a
 * new unique index without a destructive push.
 */

export interface MaterialSubCategory {
  id: string;
  name: string;
  materials: number;
}

export interface MaterialCategoryNode extends MaterialSubCategory {
  children: MaterialSubCategory[];
}

export async function listMaterialCategories(): Promise<MaterialCategoryNode[]> {
  const [rows, grouped, subGrouped] = await Promise.all([
    prisma.materialCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
    prisma.studyMaterial.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.studyMaterial.groupBy({ by: ["subCategoryId"], _count: { _all: true } }),
  ]);

  const counts = new Map<string, number>();
  for (const g of grouped) if (g.categoryId) counts.set(g.categoryId, g._count._all);
  for (const g of subGrouped) if (g.subCategoryId) counts.set(g.subCategoryId, g._count._all);

  return rows
    .filter((r) => !r.parentId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      materials: counts.get(p.id) ?? 0,
      children: rows
        .filter((r) => r.parentId === p.id)
        .map((c) => ({ id: c.id, name: c.name, materials: counts.get(c.id) ?? 0 })),
    }));
}

export interface MaterialCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

export async function listMaterialCategoryOptions(): Promise<MaterialCategoryOption[]> {
  return prisma.materialCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });
}

async function assertNameFree(name: string, parentId: string | null, exceptId?: string) {
  const clash = await prisma.materialCategory.findFirst({
    where: { name, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw AppError.conflict(
      parentId ? "That sub-category already exists here." : "That category already exists.",
    );
  }
}

export async function createMaterialCategory(input: MaterialCategoryInput): Promise<string> {
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await prisma.materialCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent) throw AppError.notFound("That category no longer exists.");
    if (parent.parentId) {
      throw AppError.badRequest("A sub-category can't hold more sub-categories.");
    }
  }
  await assertNameFree(input.name, parentId);
  const last = await prisma.materialCategory.findFirst({
    where: { parentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const row = await prisma.materialCategory.create({
    data: { name: input.name, parentId, order: (last?.order ?? -1) + 1 },
    select: { id: true },
  });
  return row.id;
}

export async function renameMaterialCategory(id: string, name: string): Promise<void> {
  const existing = await prisma.materialCategory.findUnique({
    where: { id },
    select: { parentId: true },
  });
  if (!existing) throw AppError.notFound("Category not found.");
  await assertNameFree(name, existing.parentId, id);
  await prisma.materialCategory.update({ where: { id }, data: { name } });
}

/**
 * Delete a category. Its sub-categories go with it, and the material underneath
 * is left ungrouped rather than deleted — `onDelete` can't express that, since
 * Prisma forbids a cascading self-relation.
 */
export async function deleteMaterialCategory(id: string): Promise<void> {
  const existing = await prisma.materialCategory.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Category not found.");

  const children = await prisma.materialCategory.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  const ids = [id, ...children.map((c) => c.id)];
  const list = Prisma.join(ids.map((x) => Prisma.sql`${x}`));
  const now = new Date();

  // Raw, for the same reason the quiz version is: a multi-row `updateMany` on a
  // model that owns a one-to-one relation throws under `relationMode = "prisma"`.
  await prisma.$executeRaw`
    UPDATE \`StudyMaterial\` SET categoryId = NULL, updatedAt = ${now}
    WHERE categoryId IN (${list})`;
  await prisma.$executeRaw`
    UPDATE \`StudyMaterial\` SET subCategoryId = NULL, updatedAt = ${now}
    WHERE subCategoryId IN (${list})`;

  // Children first: with NoAction on the self-relation, deleting a parent that
  // still has one is rejected (P2014).
  if (children.length > 0) {
    await prisma.materialCategory.deleteMany({ where: { parentId: id } });
  }
  await prisma.materialCategory.delete({ where: { id } });
}
