import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * Makes sure the two unique indexes the recording counters depend on exist.
 *
 *   RecordingView_meetingId_userId_key
 *   RecordingDevice_meetingId_userId_deviceId_key
 *
 * Why this is a script and not just a schema line: `prisma db push` treats a
 * unique constraint *added to an existing table* as a data-loss risk and
 * demands `--accept-data-loss`, a flag that would also wave through genuinely
 * destructive diffs — so the repo creates such indexes by hand instead
 * (scripts/add-lead-no-index.ts, scripts/add-blog-slug-index.ts). Both indexes
 * here happened to land inside the initial `CREATE TABLE`, where push raises no
 * objection, so on the live database this script had nothing to do. It stays
 * because the invariant matters: `recording-service` counts views and devices
 * with `INSERT … ON DUPLICATE KEY UPDATE`, which silently degrades into
 * "insert a second row" if the unique key is missing. Run it after any
 * hand-editing of these tables.
 *
 *   npx tsx --env-file=.env scripts/add-recording-unique-indexes.ts
 */

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const INDEXES = [
  {
    table: "RecordingView",
    name: "RecordingView_meetingId_userId_key",
    columns: ["meetingId", "userId"],
  },
  {
    table: "RecordingDevice",
    name: "RecordingDevice_meetingId_userId_deviceId_key",
    columns: ["meetingId", "userId", "deviceId"],
  },
];

async function main() {
  for (const idx of INDEXES) {
    const existing = await prisma.$queryRawUnsafe<{ Key_name: string }[]>(
      `SHOW INDEX FROM \`${idx.table}\` WHERE Key_name = '${idx.name}'`,
    );
    if (existing.length > 0) {
      console.log(`${idx.name} already exists — nothing to do.`);
      continue;
    }

    // Duplicates would make CREATE UNIQUE INDEX fail halfway; say which rows.
    const cols = idx.columns.map((c) => `\`${c}\``).join(", ");
    const duplicates = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${cols}, COUNT(*) AS n FROM \`${idx.table}\` GROUP BY ${cols} HAVING n > 1`,
    );
    if (duplicates.length > 0) {
      console.error(
        `Duplicate rows in ${idx.table} must be merged before ${idx.name} can be added:`,
      );
      for (const d of duplicates) console.error(`  ${JSON.stringify(d)}`);
      process.exitCode = 1;
      continue;
    }

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX \`${idx.name}\` ON \`${idx.table}\` (${cols})`,
    );
    console.log(`Created unique index ${idx.name}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
