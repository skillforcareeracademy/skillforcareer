/**
 * Put every existing invoice on the academy's own numbering — SFC0001, SFC0002,
 * … in the order the payments were taken.
 *
 *   npx tsx --env-file=.env scripts/renumber-invoices.ts
 *
 * New invoices are numbered this way from `payment-service.uniqueInvoice`; this
 * is the one-time pass over the rows raised before that (INV-SEED-0001,
 * INV-2026-913434 and the like). Idempotent: anything already numbered SFC####
 * keeps its number, and the rest are appended after the highest one.
 *
 * Two passes, because `invoiceNumber` is unique and a renumber can otherwise
 * collide with a row it hasn't reached yet.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { INVOICE_PREFIX, invoiceNoFor } from "../src/server/services/payment-service";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const all = await prisma.payment.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, invoiceNumber: true },
  });
  const numbered = all.filter((p) => p.invoiceNumber.startsWith(INVOICE_PREFIX));
  const rest = all.filter((p) => !p.invoiceNumber.startsWith(INVOICE_PREFIX));
  if (rest.length === 0) {
    console.log(`Nothing to do — all ${all.length} invoices already use ${INVOICE_PREFIX}.`);
    return;
  }

  let seq = numbered.reduce((max, p) => {
    const n = Number(p.invoiceNumber.slice(INVOICE_PREFIX.length));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);

  // Pass one: park them somewhere nothing else can be, so pass two is free to
  // use any number in the sequence.
  for (const p of rest) {
    await prisma.payment.update({
      where: { id: p.id },
      data: { invoiceNumber: `TMP-${p.id}` },
    });
  }
  // Pass two: the real numbers, oldest payment first.
  for (const p of rest) {
    seq += 1;
    const invoiceNumber = invoiceNoFor(seq);
    await prisma.payment.update({ where: { id: p.id }, data: { invoiceNumber } });
    console.log(`${p.invoiceNumber} → ${invoiceNumber}`);
  }
  console.log(`Renumbered ${rest.length} invoice(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
