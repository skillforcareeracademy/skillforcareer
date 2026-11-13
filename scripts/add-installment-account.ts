import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Add `Installment.accountId` (the account one EMI is routed to / paid into) and
 * its index. Additive + idempotent — safe to re-run.
 *
 *   npx tsx --env-file=.env scripts/add-installment-account.ts
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
  if (
    await has(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Installment' AND COLUMN_NAME = 'accountId'",
    )
  ) {
    console.log("column Installment.accountId already present");
  } else {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `Installment` ADD COLUMN `accountId` VARCHAR(191) NULL",
    );
    console.log("added column Installment.accountId");
  }

  if (
    await has(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Installment' AND INDEX_NAME = 'Installment_accountId_idx'",
    )
  ) {
    console.log("index Installment_accountId_idx already present");
  } else {
    await prisma.$executeRawUnsafe(
      "CREATE INDEX `Installment_accountId_idx` ON `Installment` (`accountId`)",
    );
    console.log("created index Installment_accountId_idx");
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
