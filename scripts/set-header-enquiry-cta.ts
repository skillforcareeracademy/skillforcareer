/**
 * Put the academy's own wording on the header button: "Enquiry Now", opening
 * the callback popup rather than the sign-up page ("Get started ka button ko
 * hata kr enquiry now ka button kr do, enquiry form k popup k sath").
 *
 *   npx tsx --env-file=.env scripts/set-header-enquiry-cta.ts
 *
 * One-time, and idempotent — the same values can be set again from
 * Admin → Homepage → Header at any time.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const row = await prisma.homeSection.findFirst({ where: { key: "header" } });
  if (!row) {
    console.log("No header section stored — the defaults already say Enquiry Now.");
    return;
  }
  const data = { ...(row.data as Record<string, unknown>) };
  data.ctaLabel = "Enquiry Now";
  data.ctaOpensEnquiry = true;
  // One enquiry button, not two: the main one now opens the popup.
  data.enquiryLabel = "";

  // The section's primary key is its key, not an id.
  await prisma.homeSection.update({
    where: { key: row.key },
    data: { data: data as Prisma.InputJsonValue },
  });
  console.log("Header button is now “Enquiry Now”, opening the enquiry form.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
