import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { QuizCategoryInput } from "@/lib/validations/quiz";

/**
 * Quiz grouping — two levels: a category and, under it, sub-categories.
 *
 * Kept separate from course categories because the academy groups its papers
 * by subject ("Medical Coding → ICD-10"), which isn't how it groups what it
 * sells. Uniqueness of a name within its parent is enforced here rather than
 * by an index: TiDB won't take a new unique index without a destructive push.
 */

export interface QuizSubCategory {
  id: string;
  name: string;
  quizzes: number;
}

export interface QuizCategoryNode extends QuizSubCategory {
  children: QuizSubCategory[];
}

export async function listQuizCategories(): Promise<QuizCategoryNode[]> {
  const [rows, grouped, subGrouped] = await Promise.all([
    prisma.quizCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
    prisma.quiz.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.quiz.groupBy({ by: ["subCategoryId"], _count: { _all: true } }),
  ]);

  const counts = new Map<string, number>();
  for (const g of grouped) if (g.categoryId) counts.set(g.categoryId, g._count._all);
  for (const g of subGrouped) {
    if (g.subCategoryId) counts.set(g.subCategoryId, g._count._all);
  }

  const parents = rows.filter((r) => !r.parentId);
  return parents.map((p) => ({
    id: p.id,
    name: p.name,
    quizzes: counts.get(p.id) ?? 0,
    children: rows
      .filter((r) => r.parentId === p.id)
      .map((c) => ({ id: c.id, name: c.name, quizzes: counts.get(c.id) ?? 0 })),
  }));
}

/** Flat list for the pickers — parents first, each followed by its children. */
export interface QuizCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

export async function listQuizCategoryOptions(): Promise<QuizCategoryOption[]> {
  const rows = await prisma.quizCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });
  return rows;
}

async function assertNameFree(name: string, parentId: string | null, exceptId?: string) {
  const clash = await prisma.quizCategory.findFirst({
    where: { name, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw AppError.conflict(
      parentId ? "That sub-category already exists here." : "That category already exists.",
    );
  }
}

export async function createQuizCategory(input: QuizCategoryInput): Promise<string> {
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await prisma.quizCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent) throw AppError.notFound("That category no longer exists.");
    // Two levels is the whole model: a sub-category can't have its own.
    if (parent.parentId) throw AppError.badRequest("A sub-category can't hold more sub-categories.");
  }
  await assertNameFree(input.name, parentId);
  const last = await prisma.quizCategory.findFirst({
    where: { parentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const row = await prisma.quizCategory.create({
    data: { name: input.name, parentId, order: (last?.order ?? -1) + 1 },
    select: { id: true },
  });
  return row.id;
}

export async function renameQuizCategory(id: string, name: string): Promise<void> {
  const existing = await prisma.quizCategory.findUnique({
    where: { id },
    select: { parentId: true },
  });
  if (!existing) throw AppError.notFound("Category not found.");
  await assertNameFree(name, existing.parentId, id);
  await prisma.quizCategory.update({ where: { id }, data: { name } });
}

/**
 * Delete a category. Its sub-categories go with it and the quizzes underneath
 * are left ungrouped — never deleted. `onDelete` can't do this: Prisma forbids
 * a cascading self-relation, and `SetNull` only covers the direct parent.
 */
export async function deleteQuizCategory(id: string): Promise<void> {
  const existing = await prisma.quizCategory.findUnique({
    where: { id },
    select: { id: true, parentId: true },
  });
  if (!existing) throw AppError.notFound("Category not found.");

  const children = await prisma.quizCategory.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  const ids = [id, ...children.map((c) => c.id)];
  const list = Prisma.join(ids.map((x) => Prisma.sql`${x}`));

  // Raw for the un-grouping: `prisma.quiz.updateMany` throws "Expected zero or
  // one element" once it matches more than one row, because `Quiz` owns a
  // one-to-one relation and `relationMode = "prisma"` reads it back. Same
  // reasoning as `release-service.setRelease`; ids come from the query above.
  await prisma.$executeRaw`
    UPDATE \`Quiz\` SET categoryId = NULL, updatedAt = ${new Date()}
    WHERE categoryId IN (${list})
  `;
  await prisma.$executeRaw`
    UPDATE \`Quiz\` SET subCategoryId = NULL, updatedAt = ${new Date()}
    WHERE subCategoryId IN (${list})
  `;
  // Children first, then the parent: with `onDelete: NoAction` on the
  // self-relation, Prisma rejects deleting a category that still has one
  // (P2014) — even inside the same `deleteMany`.
  if (children.length > 0) {
    await prisma.quizCategory.deleteMany({ where: { parentId: id } });
  }
  await prisma.quizCategory.delete({ where: { id } });
}
