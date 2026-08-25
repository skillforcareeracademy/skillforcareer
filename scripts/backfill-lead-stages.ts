import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

/**
 * One-off backfill for the client's expanded lead sheet:
 *   • gives every existing lead a reference number (SFC1, SFC2, …),
 *   • maps the legacy 5-value `status` onto the new 9-stage funnel,
 *   • copies createdAt into the new editable `leadDate`.
 *
 * Safe to re-run — leads that already carry a leadNo keep it.
 *
 *   npx tsx --env-file=.env scripts/backfill-lead-stages.ts
 */

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const STAGE = {
  NEW: "FRESH_LEAD",
  CONTACTED: "CONTACTED",
  QUALIFIED: "INTERESTED",
  CONVERTED: "CONVERTED",
  LOST: "NOT_INTERESTED",
} as const;

type LegacyStatus = keyof typeof STAGE;

async function main() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, createdAt: true, leadNo: true },
  });

  let next = 0;
  const taken = new Set(leads.map((l) => l.leadNo).filter(Boolean) as string[]);
  for (const lead of leads) {
    let leadNo = lead.leadNo;
    if (!leadNo) {
      do {
        next += 1;
        leadNo = `SFC${next}`;
      } while (taken.has(leadNo));
      taken.add(leadNo);
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        leadNo,
        stage: STAGE[lead.status as LegacyStatus] ?? "FRESH_LEAD",
        leadDate: lead.createdAt,
      },
    });
  }

  const followUps = await prisma.leadFollowUp.findMany({
    where: { status: { not: null }, stage: null },
    select: { id: true, status: true },
  });
  for (const f of followUps) {
    await prisma.leadFollowUp.update({
      where: { id: f.id },
      data: { stage: STAGE[f.status as LegacyStatus] ?? null },
    });
  }

  console.log(
    `Backfilled ${leads.length} lead(s) and ${followUps.length} follow-up(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
