/**
 * Questions with one right answer are single-answer questions.
 *
 * Imports and the generator both wrote MULTIPLE_CHOICE regardless, so the
 * learner was shown "select all that apply" and could tick several options on a
 * question with one key. This retypes the existing rows; `questionSchema` keeps
 * new ones honest.
 *
 *   npx tsx --env-file=.env scripts/retype-single-answer-questions.ts [--apply]
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.question.findMany({
    where: { type: "MULTIPLE_CHOICE" },
    select: { id: true, options: { select: { isCorrect: true } } },
  });

  const ids = rows
    .filter((q) => q.options.filter((o) => o.isCorrect).length === 1)
    .map((q) => q.id);

  console.log(`multiple-choice questions: ${rows.length}`);
  console.log(`…with exactly one correct option: ${ids.length}`);

  if (!apply) {
    console.log("\nDry run. Pass --apply to retype them.");
    return;
  }

  // In batches: a thousand ids in one IN clause is a long query for TiDB.
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const res = await prisma.question.updateMany({
      where: { id: { in: batch } },
      data: { type: "SINGLE_CHOICE" },
    });
    done += res.count;
  }
  console.log(`retyped to SINGLE_CHOICE: ${done}`);

  const left = await prisma.question.count({
    where: { type: "MULTIPLE_CHOICE" },
  });
  console.log(`multiple-choice remaining (genuine "select all"): ${left}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1);
});
