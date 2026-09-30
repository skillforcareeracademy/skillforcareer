/**
 * Move the academy's existing folders into the one filing system.
 *
 *   npx tsx --env-file=.env scripts/migrate-content-groups.ts
 *
 * Quiz categories and study-material categories were two near-identical
 * two-level trees. They become `ContentGroup` rows of kind QUIZ and MATERIAL,
 * keeping their shape and their order, and everything filed in them is filed
 * again in the new one. Idempotent: a folder already carried across is matched
 * by name and parent rather than duplicated.
 *
 * The old tables are left alone. Nothing reads them after this, but a migration
 * that deletes the only copy of the academy's filing is not one worth running.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

/** Find or make the matching folder in the new tree. */
async function folderFor(
  kind: "QUIZ" | "MATERIAL",
  name: string,
  parentId: string | null,
  order: number,
): Promise<string> {
  const found = await prisma.contentGroup.findFirst({
    where: { kind, name, parentId },
    select: { id: true },
  });
  if (found) return found.id;
  const made = await prisma.contentGroup.create({
    data: { kind, name, parentId, order },
    select: { id: true },
  });
  return made.id;
}

async function file(kind: "QUIZ" | "MATERIAL", groupId: string, itemId: string) {
  const already = await prisma.contentGroupItem.findFirst({
    where: { groupId, itemId },
    select: { id: true },
  });
  if (already) return 0;
  await prisma.contentGroupItem.create({ data: { groupId, itemId, kind } });
  return 1;
}

async function main() {
  const report = { quizFolders: 0, materialFolders: 0, quizzesFiled: 0, materialsFiled: 0 };

  // ── Quizzes ───────────────────────────────────────────────────────────────
  const quizCats = await prisma.quizCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, order: true },
  });
  const quizMap = new Map<string, string>();
  for (const c of quizCats.filter((c) => !c.parentId)) {
    quizMap.set(c.id, await folderFor("QUIZ", c.name, null, c.order));
    report.quizFolders += 1;
  }
  for (const c of quizCats.filter((c) => c.parentId)) {
    const parent = quizMap.get(c.parentId!);
    if (!parent) continue;
    quizMap.set(c.id, await folderFor("QUIZ", c.name, parent, c.order));
    report.quizFolders += 1;
  }
  const quizzes = await prisma.quiz.findMany({
    select: { id: true, categoryId: true, subCategoryId: true },
  });
  for (const q of quizzes) {
    // The narrowest folder it was in is the one that carries across; the
    // parent is implied by the tree.
    const target = q.subCategoryId ?? q.categoryId;
    const groupId = target ? quizMap.get(target) : null;
    if (groupId) report.quizzesFiled += await file("QUIZ", groupId, q.id);
  }

  // ── Study material ────────────────────────────────────────────────────────
  const matCats = await prisma.materialCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, order: true },
  });
  const matMap = new Map<string, string>();
  for (const c of matCats.filter((c) => !c.parentId)) {
    matMap.set(c.id, await folderFor("MATERIAL", c.name, null, c.order));
    report.materialFolders += 1;
  }
  for (const c of matCats.filter((c) => c.parentId)) {
    const parent = matMap.get(c.parentId!);
    if (!parent) continue;
    matMap.set(c.id, await folderFor("MATERIAL", c.name, parent, c.order));
    report.materialFolders += 1;
  }
  const materials = await prisma.studyMaterial.findMany({
    select: { id: true, categoryId: true, subCategoryId: true },
  });
  for (const m of materials) {
    const target = m.subCategoryId ?? m.categoryId;
    const groupId = target ? matMap.get(target) : null;
    if (groupId) report.materialsFiled += await file("MATERIAL", groupId, m.id);
  }

  process.stdout.write(JSON.stringify(report) + "\n");
  const tree = await prisma.contentGroup.findMany({
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { kind: true, name: true, parentId: true },
  });
  for (const g of tree) {
    process.stdout.write(`  ${g.kind}${g.parentId ? "   ↳" : " "} ${g.name}\n`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  process.stdout.write(`failed: ${e instanceof Error ? e.message : String(e)}\n`);
  await prisma.$disconnect();
});
