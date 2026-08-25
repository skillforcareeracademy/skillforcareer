import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Adds the unique index behind `Lead.leadNo`.
 *
 * Purely additive — no column or row is touched — but `prisma db push` classes
 * every new unique constraint as a data-loss risk and demands
 * `--accept-data-loss`, which would also wave through genuinely destructive
 * diffs. Creating the index here keeps that flag out of the workflow: once it
 * exists, `db push` sees no difference and runs clean.
 *
 *   npx tsx --env-file=.env scripts/add-lead-no-index.ts
 */

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  // `Lead` is a reserved word in MySQL 8 / TiDB (the LEAD() window function),
  // so the table name stays backticked in raw SQL.
  const duplicates = await prisma.$queryRawUnsafe<
    { leadNo: string; n: bigint }[]
  >(
    "SELECT leadNo, COUNT(*) AS n FROM `Lead` WHERE leadNo IS NOT NULL GROUP BY leadNo HAVING n > 1",
  );
  if (duplicates.length) {
    console.error(
      "Duplicate lead numbers found — run scripts/backfill-lead-stages.ts first:",
    );
    console.error(duplicates.map((d) => `  ${d.leadNo} ×${d.n}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  try {
    await prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX `Lead_leadNo_key` ON `Lead`(`leadNo`)",
    );
    console.log("Created unique index Lead_leadNo_key.");
  } catch (err) {
    const message = (err as Error).message;
    if (/Duplicate key name|already exists/i.test(message)) {
      console.log(
        "Unique index Lead_leadNo_key already exists — nothing to do.",
      );
      return;
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
