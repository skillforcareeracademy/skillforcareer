import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Repoint `Quiz.categoryId` / `subCategoryId` at the shared group tree.
 *
 * Quizzes used to be filed in `QuizCategory`, a table that stopped being
 * maintained the day the Groups page arrived: the academy had built four
 * subjects in Groups while the New quiz dialog still offered one, because it
 * read the old table. The columns now hold `ContentGroup` ids, so the ids
 * already on existing quizzes have to be translated — by name, which is how a
 * person would do it.
 *
 * Nothing is created: a legacy name with no folder is reported and left alone,
 * so a typo cannot quietly litter the tree with near-duplicates. Membership is
 * added too, so the folder view agrees with the numbering. Safe to run twice —
 * a quiz already pointing at a ContentGroup is skipped.
 *
 *   npx tsx --env-file=.env scripts/move-quiz-groups-to-content-groups.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const norm = (name: string) => name.trim().toLowerCase();

async function main() {
  const dryRun = !process.argv.includes("--write");

  const [legacy, groups, quizzes] = await Promise.all([
    prisma.quizCategory.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.contentGroup.findMany({
      where: { kind: "QUIZ" },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.quiz.findMany({
      where: { OR: [{ categoryId: { not: null } }, { subCategoryId: { not: null } }] },
      select: { id: true, title: true, categoryId: true, subCategoryId: true },
    }),
  ]);

  const legacyById = new Map(legacy.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Matched on name alone, anywhere in the tree. The two structures disagree
  // about depth — the old table had "Medical Coding → MC Fundamentals" flat,
  // while the tree files it under "Medical Coding → Medical Coding Basics →
  // MC Fundamentals" — so insisting on the same parent would match nothing and
  // create a second folder of every name beside the real one.
  const byName = new Map<string, string[]>();
  for (const g of groups) {
    byName.set(norm(g.name), [...(byName.get(norm(g.name)) ?? []), g.id]);
  }

  /** Every ancestor of a folder, for breaking a tie between two same names. */
  function ancestry(id: string): string[] {
    const out: string[] = [];
    let cursor: string | null = id;
    for (let hops = 0; cursor && hops < 50; hops += 1) {
      cursor = groupById.get(cursor)?.parentId ?? null;
      if (cursor) out.push(cursor);
    }
    return out;
  }

  const unmatched = new Set<string>();

  /** The folder a legacy category corresponds to, by name. */
  function folderFor(legacyId: string): string | null {
    const cat = legacyById.get(legacyId);
    if (!cat) return null;
    const hits = byName.get(norm(cat.name)) ?? [];
    if (hits.length === 0) {
      unmatched.add(cat.name);
      return null;
    }
    if (hits.length === 1) return hits[0];
    // Two folders share the name: prefer the one sitting under the folder the
    // legacy parent maps to.
    const parentFolder = cat.parentId ? folderFor(cat.parentId) : null;
    if (parentFolder) {
      const nested = hits.find((h) => ancestry(h).includes(parentFolder));
      if (nested) return nested;
    }
    return hits[0];
  }

  let moved = 0;
  let already = 0;

  for (const z of quizzes) {
    // Already pointing at the tree — nothing to translate.
    const catOk = !z.categoryId || groupById.has(z.categoryId);
    const subOk = !z.subCategoryId || groupById.has(z.subCategoryId);
    if (catOk && subOk) {
      already += 1;
      continue;
    }

    const categoryId = z.categoryId ? folderFor(z.categoryId) : null;
    const subCategoryId = z.subCategoryId ? folderFor(z.subCategoryId) : null;
    console.log(
      `${dryRun ? "would move" : "moving"} "${z.title}" → ` +
        `${categoryId ? (groupById.get(categoryId)?.name ?? categoryId) : "none"}` +
        `${subCategoryId ? ` → ${groupById.get(subCategoryId)?.name ?? subCategoryId}` : ""}`,
    );
    if (dryRun) continue;

    await prisma.quiz.updateMany({
      where: { id: z.id },
      data: { categoryId, subCategoryId },
    });

    // Make the folder view agree with the numbering, without disturbing any
    // other folder the quiz is already filed in.
    const primary = subCategoryId || categoryId;
    if (primary) {
      const existing = await prisma.contentGroupItem.findFirst({
        where: { kind: "QUIZ", itemId: z.id, groupId: primary },
        select: { id: true },
      });
      if (!existing) {
        await prisma.contentGroupItem.create({
          data: { kind: "QUIZ", itemId: z.id, groupId: primary },
        });
      }
    }
    moved += 1;
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${moved} moved, ${already} already on the tree, ` +
      `${quizzes.length} filed quizzes in all.`,
  );
  if (unmatched.size > 0) {
    console.log(
      `\nNo folder of these names — make them in Quiz groups first, then re-run:\n  ` +
        [...unmatched].join("\n  "),
    );
  }
  if (dryRun) console.log("Re-run with --write to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
