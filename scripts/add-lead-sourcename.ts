import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Add `Lead.sourceName` (the counsellor's finer source label — "Justdial Noida")
 * and its index. Additive + idempotent: checks information_schema first, so it is
 * safe to re-run. `Lead` is a TiDB reserved word → backticked.
 *
 *   npx tsx --env-file=.env scripts/add-lead-sourcename.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function has(sql: string): Promise<boolean> {
  const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql);
  return Number(row?.n ?? 0) > 0;
}

async function main() {
  const hasCol = await has(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Lead' AND COLUMN_NAME = 'sourceName'",
  );
  if (hasCol) {
    console.log("column Lead.sourceName already present");
  } else {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `Lead` ADD COLUMN `sourceName` VARCHAR(80) NULL",
    );
    console.log("added column Lead.sourceName");
  }

  const hasIdx = await has(
    "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Lead' AND INDEX_NAME = 'Lead_sourceName_idx'",
  );
  if (hasIdx) {
    console.log("index Lead_sourceName_idx already present");
  } else {
    await prisma.$executeRawUnsafe(
      "CREATE INDEX `Lead_sourceName_idx` ON `Lead` (`sourceName`)",
    );
    console.log("created index Lead_sourceName_idx");
  }
  console.log("done");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
