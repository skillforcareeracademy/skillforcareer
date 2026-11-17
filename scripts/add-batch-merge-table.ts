import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Create the `BatchMerge` table that records a batch merge so it can be undone.
 *
 * Done with an idempotent CREATE TABLE rather than `prisma db push`, which syncs
 * the whole schema and can touch unrelated tables on TiDB. Columns mirror what
 * Prisma generates for the model (varchar(191) / json / datetime(3)).
 *
 *   npx tsx --env-file=.env scripts/add-batch-merge-table.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`BatchMerge\` (
      \`id\`             VARCHAR(191) NOT NULL,
      \`targetBatchId\`  VARCHAR(191) NOT NULL,
      \`sourceBatchIds\` JSON NOT NULL,
      \`ledger\`         JSON NOT NULL,
      \`createdById\`    VARCHAR(191) NULL,
      \`status\`         VARCHAR(191) NOT NULL DEFAULT 'MERGED',
      \`createdAt\`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`separatedAt\`    DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`BatchMerge_targetBatchId_idx\` (\`targetBatchId\`),
      INDEX \`BatchMerge_status_idx\` (\`status\`)
    )
  `);
  const [{ n }] = (await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM `BatchMerge`",
  )) as { n: number }[];
  console.log(`✔ BatchMerge table ready (rows: ${n})`);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
