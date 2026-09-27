/**
 * Put "Refer Now" in the website menu, next to the academy's own links.
 *
 *   npx tsx --env-file=.env scripts/add-refer-menu-link.ts
 *
 * The header's links are edited under Admin → Homepage → Header; this adds the
 * one the academy asked for without disturbing the rest. Idempotent.
 */
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { getMariaDbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const row = await prisma.homeSection.findFirst({ where: { key: "header" } });
  if (!row) {
    console.log("No header stored — the default menu already carries Refer Now.");
    return;
  }
  const data = { ...(row.data as Record<string, unknown>) };
  const links = Array.isArray(data.navLinks) ? [...(data.navLinks as Record<string, unknown>[])] : [];
  if (links.some((l) => String(l.href ?? "").startsWith("/refer"))) {
    console.log("Refer Now is already in the menu.");
    return;
  }
  links.push({ label: "Refer Now", href: "/refer", menu: "none" });
  data.navLinks = links;

  await prisma.homeSection.update({
    where: { key: row.key },
    data: { data: data as Prisma.InputJsonValue },
  });
  console.log("Added “Refer Now” to the website menu.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
