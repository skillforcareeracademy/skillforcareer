import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Create the `AdConfig` table on a database migrated a step behind the schema.
 * Additive and idempotent (IF NOT EXISTS) — the engine-free client has no
 * migration history, so a surgical CREATE is safer than `db push`, which would
 * reconcile the whole schema.
 *
 *   npx tsx --env-file=.env scripts/create-adconfig-table.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`AdConfig\` (
      \`id\`              VARCHAR(191) NOT NULL,
      \`metaAppId\`       VARCHAR(191) NULL,
      \`metaAppSecret\`   TEXT NULL,
      \`metaPageId\`      VARCHAR(191) NULL,
      \`metaPageToken\`   TEXT NULL,
      \`metaVerifyToken\` VARCHAR(191) NULL,
      \`googleLeadsKey\`  VARCHAR(191) NULL,
      \`updatedAt\`       DATETIME(3) NOT NULL,
      \`updatedBy\`       VARCHAR(191) NULL,
      PRIMARY KEY (\`id\`)
    )
  `);
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    "SELECT COUNT(*) AS n FROM `AdConfig`",
  );
  console.log(`AdConfig ready (rows: ${Number(n)})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
