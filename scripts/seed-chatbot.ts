/**
 * Seed Ami's starter knowledge base.
 *
 *   npx tsx --env-file=.env scripts/seed-chatbot.ts
 *   npx tsx --env-file=.env scripts/seed-chatbot.ts --clean
 *
 * Idempotent: an intent is matched on its `question`, so re-running updates the
 * answer rather than duplicating it, and anything the academy has since edited
 * by hand is left alone unless `--force` is passed.
 *
 * These are the questions the counsellors answer on the phone all day. They are
 * a starting point, not the final wording — the client edits every one of them
 * in Admin → Assistant, which is the whole point of the feature.
 */
import { prisma } from "../src/lib/prisma";
import { siteConfig } from "../src/config/site";

interface SeedIntent {
  question: string;
  patterns: string[];
  answer: string;
  actionLabel?: string;
  actionUrl?: string;
  category: string;
  isSuggested?: boolean;
}

const INTENTS: SeedIntent[] = [
  {
    question: "What courses do you offer?",
    patterns: [
      "courses",
      "programs",
      "what can i learn",
      "course list",
      "kaun se course hain",
      "which courses are available",
    ],
    answer:
      "We run job-ready programmes in data science, AI and machine learning, full-stack development, digital marketing, medical coding and management. Every one is taught live by working professionals, with real projects and placement support.",
    actionLabel: "Browse all courses",
    actionUrl: "/courses",
    category: "Courses",
    isSuggested: true,
  },
  {
    question: "What are the fees?",
    patterns: [
      "fees",
      "fee",
      "price",
      "cost",
      "how much",
      "kitni fees",
      "fees kitni hai",
      "charges",
    ],
    answer:
      "Fees depend on the programme — each course page shows its price and any discount running at the moment. We also offer instalment plans, including zero-cost EMI on most programmes. Leave your number and a counsellor will talk you through the options for the course you're interested in.",
    actionLabel: "See course fees",
    actionUrl: "/courses",
    category: "Fees",
    isSuggested: true,
  },
  {
    question: "Do you offer EMI or instalments?",
    patterns: [
      "emi",
      "instalment",
      "installment",
      "monthly payment",
      "pay in parts",
      "kist",
      "zero cost emi",
    ],
    answer:
      "Yes. Most programmes can be paid in monthly instalments, and several qualify for zero-cost EMI — you pay the course price spread out, with nothing added on top. Your instalment schedule appears in your learner panel under Fees, so you always know what's due next.",
    actionLabel: "Talk to a counsellor",
    actionUrl: "/contact",
    category: "Fees",
    isSuggested: true,
  },
  {
    question: "Do you provide placement support?",
    patterns: [
      "placement",
      "job",
      "jobs",
      "hiring",
      "will i get a job",
      "job guarantee",
      "naukri",
      "career support",
    ],
    answer:
      "Yes. Placement support runs alongside the course: CV and portfolio reviews, mock interviews, and introductions to our 100+ hiring partners. Support continues after you finish — we don't stop at the certificate.",
    actionLabel: "See placement stories",
    actionUrl: "/#placement-stories",
    category: "Placement",
    isSuggested: true,
  },
  {
    question: "Are the classes live or recorded?",
    patterns: [
      "live classes",
      "recorded",
      "online",
      "offline",
      "class mode",
      "live ya recorded",
      "batch timing",
    ],
    answer:
      "Both. Every programme has live interactive classes with a mentor, and each session is recorded so you can revisit it in your panel. We also run offline batches at our Faridabad and Greater Noida centres.",
    actionLabel: "See live classes",
    actionUrl: "/live-classes",
    category: "Courses",
  },
  {
    question: "Do I get a certificate?",
    patterns: [
      "certificate",
      "certification",
      "will i get certificate",
      "certificate milega",
      "is it recognised",
    ],
    answer:
      "Yes — you receive a verified certificate on completion. Every certificate carries a unique verification code that employers can check on our website, so it can be trusted rather than just claimed.",
    actionLabel: "Verify a certificate",
    actionUrl: "/verify",
    category: "Certificates",
  },
  {
    question: "How do I enrol?",
    patterns: [
      "enroll",
      "enrol",
      "join",
      "admission",
      "how to register",
      "sign up",
      "admission kaise le",
    ],
    answer:
      "Open the course you want and press Enroll Now — you fill in your name, email and number on one page and pay there, and your learner account is created for you. No separate sign-up step. If you'd rather talk first, ask for a callback and a counsellor will call you.",
    actionLabel: "Browse courses",
    actionUrl: "/courses",
    category: "Admissions",
    isSuggested: true,
  },
  {
    question: "Can I get a refund?",
    patterns: ["refund", "money back", "cancel", "refund policy", "paisa wapas"],
    answer:
      "Yes — there's a 30-day money-back guarantee on our online programmes. If it isn't right for you, tell us inside 30 days of enrolling and we'll refund the fee. Do read the full terms, since offline batches work slightly differently.",
    actionLabel: "Read the terms",
    actionUrl: "/terms",
    category: "Fees",
  },
  {
    question: "Where are you located?",
    patterns: [
      "address",
      "location",
      "office",
      "centre",
      "center",
      "where are you",
      "kahan ho",
      "branch",
    ],
    answer: `We have two centres — ${siteConfig.contact.offices
      .map((o) => `${o.label} (${o.line1}, ${o.line2})`)
      .join(" and ")}. You're welcome to visit; call ahead and we'll keep a counsellor free for you.`,
    actionLabel: "Contact us",
    actionUrl: "/contact",
    category: "Contact",
  },
  {
    question: "How can I contact you?",
    patterns: [
      "contact",
      "phone number",
      "call",
      "whatsapp",
      "email",
      "talk to someone",
      "counsellor",
      "baat karni hai",
    ],
    answer: `Call us on ${siteConfig.contact.phoneDisplay} or email ${siteConfig.contact.email}. We're open ${siteConfig.contact.hours}. You can also leave your number and we'll call you back.`,
    actionLabel: "Request a callback",
    actionUrl: "/contact",
    category: "Contact",
    isSuggested: true,
  },
  {
    question: "Do I need any experience to start?",
    patterns: [
      "prerequisite",
      "eligibility",
      "beginner",
      "no experience",
      "fresher",
      "kya main kar sakta hu",
      "who can join",
    ],
    answer:
      "Most of our programmes start from the basics, so freshers and career-changers are welcome. Each course page lists its level and any prerequisites. If you're unsure which to pick, a counsellor will help you choose based on your background.",
    actionLabel: "Browse courses",
    actionUrl: "/courses",
    category: "Admissions",
  },
  {
    question: "Are webinars free?",
    patterns: ["webinar", "masterclass", "free session", "demo class", "free class"],
    answer:
      "Yes — our webinars and masterclasses are free to attend. Register on the webinar page and you'll get the joining link. Stay for the whole session and you'll also unlock an extra discount on your course fee.",
    actionLabel: "See upcoming webinars",
    actionUrl: "/webinars",
    category: "Courses",
  },
  {
    question: "I've forgotten my password",
    patterns: [
      "forgot password",
      "reset password",
      "can't log in",
      "cannot login",
      "password bhool gaya",
      "login problem",
    ],
    answer:
      "Use the Forgot password link on the sign-in page — we'll email you a code to set a new one. If the email doesn't arrive within a few minutes, check your spam folder or give the office a call.",
    actionLabel: "Reset your password",
    actionUrl: "/forgot-password",
    category: "Account",
  },
];

async function main() {
  const clean = process.argv.includes("--clean");
  const force = process.argv.includes("--force");

  if (clean) {
    const questions = INTENTS.map((i) => i.question);
    const doomed = await prisma.chatIntent.findMany({
      where: { question: { in: questions } },
      select: { id: true },
    });
    const ids = doomed.map((d) => d.id);
    if (ids.length > 0) {
      // Cascades aren't enforced under relationMode="prisma" — clear the
      // pointers by hand so the transcript survives the intent.
      await prisma.chatMessage.updateMany({
        where: { intentId: { in: ids } },
        data: { intentId: null },
      });
      await prisma.chatIntent.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`Removed ${ids.length} seeded answers.`);
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const intent of INTENTS) {
    const existing = await prisma.chatIntent.findFirst({
      where: { question: intent.question },
      select: { id: true, updatedAt: true, createdAt: true },
    });

    const data = {
      question: intent.question,
      patterns: intent.patterns,
      answer: intent.answer,
      actionLabel: intent.actionLabel ?? null,
      actionUrl: intent.actionUrl ?? null,
      category: intent.category,
      isSuggested: intent.isSuggested ?? false,
      isActive: true,
    };

    if (!existing) {
      await prisma.chatIntent.create({ data });
      created += 1;
      continue;
    }

    // Edited by a human since it was seeded? Leave it, unless told otherwise —
    // silently overwriting the client's own wording would be the worst outcome.
    const edited = existing.updatedAt.getTime() - existing.createdAt.getTime() > 1000;
    if (edited && !force) {
      skipped += 1;
      continue;
    }
    await prisma.chatIntent.update({ where: { id: existing.id }, data });
    updated += 1;
  }

  console.log(
    `Ami: ${created} answers added, ${updated} refreshed, ${skipped} left as edited.`,
  );
  console.log("Edit them at Admin → Assistant.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // The Prisma pool keeps the process alive otherwise.
  .finally(() => prisma.$disconnect());
