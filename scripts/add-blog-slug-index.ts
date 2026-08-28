import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Adds the unique index behind `BlogPost.slug`.
 *
 * Purely additive, but `prisma db push` classes every new unique constraint as
 * a data-loss risk and demands `--accept-data-loss` — a flag that would also
 * wave through genuinely destructive diffs. Creating the index here keeps it
 * out of the workflow: once it exists, `db push` sees no difference.
 *
 *   npx tsx --env-file=.env scripts/add-blog-slug-index.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  const duplicates = await prisma.$queryRawUnsafe<{ slug: string; n: bigint }[]>(
    "SELECT slug, COUNT(*) AS n FROM BlogPost GROUP BY slug HAVING n > 1",
  );
  if (duplicates.length > 0) {
    console.error("Duplicate slugs must be resolved before the index can be added:");
    for (const d of duplicates) console.error(`  ${d.slug} × ${d.n}`);
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.$queryRawUnsafe<{ Key_name: string }[]>(
    "SHOW INDEX FROM BlogPost WHERE Key_name = 'BlogPost_slug_key'",
  );
  if (existing.length > 0) {
    console.log("BlogPost_slug_key already exists — nothing to do.");
    return;
  }

  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX BlogPost_slug_key ON BlogPost (slug)",
  );
  console.log("Created unique index BlogPost_slug_key.");
}

main().finally(() => prisma.$disconnect());
