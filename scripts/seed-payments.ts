import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample payments so /admin/payments has content. Uses deterministic
 * INV-SEED-* invoice numbers, so it's idempotent and cleanly removable.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-payments.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-payments.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

type St = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
type Prov = "RAZORPAY" | "STRIPE" | "WALLET" | "MANUAL";

interface Seed {
  invoice: string;
  courseSlug: string;
  amount: number;
  status: St;
  provider: Prov;
  refund?: { amount: number; reason: string };
}

const PAYMENTS: Seed[] = [
  { invoice: "INV-SEED-0001", courseSlug: "complete-data-science-bootcamp-python", amount: 8499, status: "PAID", provider: "RAZORPAY" },
  { invoice: "INV-SEED-0002", courseSlug: "full-stack-web-development-react-node", amount: 7499, status: "PAID", provider: "STRIPE" },
  { invoice: "INV-SEED-0003", courseSlug: "machine-learning-a-z-hands-on", amount: 9999, status: "PENDING", provider: "RAZORPAY" },
  { invoice: "INV-SEED-0004", courseSlug: "digital-marketing-masterclass-2026", amount: 4999, status: "PAID", provider: "MANUAL" },
  { invoice: "INV-SEED-0005", courseSlug: "aws-certified-cloud-practitioner", amount: 5499, status: "FAILED", provider: "RAZORPAY" },
  {
    invoice: "INV-SEED-0006",
    courseSlug: "product-management-fundamentals",
    amount: 9999,
    status: "PARTIALLY_REFUNDED",
    provider: "STRIPE",
    refund: { amount: 3000, reason: "Partial refund — switched to a shorter plan" },
  },
];

const INVOICES = PAYMENTS.map((p) => p.invoice);

async function clean() {
  const rows = await prisma.payment.findMany({
    where: { invoiceNumber: { in: INVOICES } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`Removed ${ids.length} sample payment(s).`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!admin) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  let created = 0;
  for (const p of PAYMENTS) {
    const exists = await prisma.payment.findUnique({ where: { invoiceNumber: p.invoice }, select: { id: true } });
    if (exists) {
      console.log(`skip (exists): ${p.invoice}`);
      continue;
    }
    const course = await prisma.course.findUnique({ where: { slug: p.courseSlug }, select: { id: true } });
    if (!course) {
      console.log(`skip (no course ${p.courseSlug}): ${p.invoice}`);
      continue;
    }
    const amount = new Prisma.Decimal(p.amount);
    await prisma.payment.create({
      data: {
        userId: admin.id,
        courseId: course.id,
        invoiceNumber: p.invoice,
        amount,
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        netAmount: amount,
        currency: "INR",
        status: p.status,
        provider: p.provider,
        type: "ONE_TIME",
        paidAt: p.status === "PAID" || p.status === "PARTIALLY_REFUNDED" ? new Date() : null,
        refunds: p.refund
          ? {
              create: {
                amount: new Prisma.Decimal(p.refund.amount),
                reason: p.refund.reason,
                status: "COMPLETED",
              },
            }
          : undefined,
      },
    });
    created += 1;
    console.log(`created: ${p.invoice} (${p.status}, ${p.provider})`);
  }
  console.log(`\nDone. Created ${created}; buyer: ${admin.name}.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
