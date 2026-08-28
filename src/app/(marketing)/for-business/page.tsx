import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  PhoneCall,
  Users,
} from "lucide-react";
import { listPublicCategories } from "@/server/services/category-service";
import { getPageSectionsFor } from "@/server/services/page-service";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ButtonLink } from "@/components/shared/button-link";
import { BusinessEnquiryForm } from "@/components/marketing/business-enquiry-form";
import { StepList, type Step } from "@/components/marketing/step-list";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "For business",
  description:
    "Corporate training for teams — custom learning paths, live cohorts, progress dashboards and verifiable certificates. Request a proposal.",
};

export const dynamic = "force-dynamic";

const { contact } = siteConfig;

const STEPS: Step[] = [
  {
    icon: PhoneCall,
    title: "Tell us the gap",
    body: "A 30-minute call to understand roles, skill gaps and timelines.",
  },
  {
    icon: FileText,
    title: "Get a costed plan",
    body: "We come back with a curriculum, schedule and per-seat pricing.",
  },
  {
    icon: Users,
    title: "Onboard the team",
    body: "Accounts, batches and learning paths are set up for you.",
  },
  {
    icon: BarChart3,
    title: "Track the outcome",
    body: "Monthly reporting on attendance, scores and completion.",
  },
];

export default async function ForBusinessPage() {
  const [allCategories, page] = await Promise.all([
    listPublicCategories(),
    getPageSectionsFor([
      "business.hero",
      "business.offerings",
      "business.faq",
      "business.cta",
    ] as const),
  ]);
  const categories = allCategories.slice(0, 8);

  const hero = page["business.hero"];
  const faqItems = page["business.faq"].data.items.filter((f) => f.q.trim());
  const offerings = page["business.offerings"];
  const faq = page["business.faq"];
  const cta = page["business.cta"];

  return (
    <>
      {/* ── Hero + proposal form ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-rose-500/15 blur-3xl" />
        </div>

        <div className="container-page py-14 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
            <div className="max-w-xl">
              {hero.data.badge && (
                <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
                  <Building2 className="size-4" /> {hero.data.badge}
                </span>
              )}
              <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
                {hero.data.titleLead}{" "}
                <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                  {hero.data.titleHighlight}
                </span>
              </h1>
              {hero.data.subtitle && (
                <p className="text-muted-foreground mt-5 text-lg text-pretty">
                  {hero.data.subtitle}
                </p>
              )}

              {hero.data.highlights.length > 0 && (
                <ul className="mt-7 space-y-2.5">
                  {hero.data.highlights
                    .filter((h) => h.text.trim())
                    .map((h) => (
                      <li key={h.text} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                        {h.text}
                      </li>
                    ))}
                </ul>
              )}

              <div className="text-muted-foreground mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a
                  href={`tel:${contact.phone}`}
                  className="hover:text-foreground flex items-center gap-2 transition-colors"
                >
                  <PhoneCall className="size-4" /> {contact.phoneDisplay}
                </a>
                <a
                  href={`mailto:${contact.email}`}
                  className="hover:text-foreground flex items-center gap-2 transition-colors"
                >
                  <Mail className="size-4" /> {contact.email}
                </a>
              </div>
            </div>

            <div id="proposal" className="scroll-mt-20">
              <BusinessEnquiryForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── What you get ─────────────────────────────────────────────────── */}
      {offerings.enabled && offerings.data.items.length > 0 && (
        <section className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">{offerings.data.title}</h2>
            {offerings.data.description && (
              <p className="text-muted-foreground mt-3">{offerings.data.description}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {offerings.data.items.map((item) => (
              <Card key={item.title} className="h-full gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <IconGlyph name={item.icon} className="size-5" />
                </span>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{item.body}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Training tracks ──────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="bg-muted/30 border-y">
          <div className="container-page py-16 sm:py-20">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl sm:text-4xl">Popular training tracks</h2>
                <p className="text-muted-foreground mt-2">
                  Start from any of these and we will shape the path around your roles.
                </p>
              </div>
              <Link
                href="/courses"
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Browse the catalogue <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c) => (
                <Link key={c.id} href={`/courses?category=${c.slug}`} className="group block h-full">
                  <Card className="hover:border-primary/50 h-full gap-0 p-5 transition-all group-hover:-translate-y-1 group-hover:shadow-lg">
                    <span className="bg-primary/10 text-primary mb-3 grid size-10 place-items-center rounded-xl">
                      <Briefcase className="size-5" />
                    </span>
                    <h3 className="leading-snug font-semibold">{c.name}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {c.courseCount} course{c.courseCount === 1 ? "" : "s"}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">How we get started</h2>
          <p className="text-muted-foreground mt-3">
            From first call to first cohort, usually inside two weeks.
          </p>
        </div>
        <StepList steps={STEPS} />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {faq.enabled && faqItems.length > 0 && (
        <section className="bg-muted/30 border-y">
          <div className="container-page py-16 sm:py-20">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-center text-3xl sm:text-4xl">{faq.data.title}</h2>
              <Card className="mt-8 gap-0 p-2 sm:p-4">
                <Accordion className="divide-y">
                  {faqItems.map((item, i) => (
                    <AccordionItem key={item.q} value={String(i)} className="border-b-0 px-3">
                      <AccordionTrigger className="py-4 text-base hover:no-underline">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground pr-6 pb-4">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* ── Closing CTA ──────────────────────────────────────────────────────
          This page's own banner. The marketing layout's site-wide banner is
          suppressed here — the two used to stack, which is the "do CTA ek sath
          hain" the client reported. The B2B one wins: "request a proposal" is
          the action this page is for. */}
      {cta.enabled && (
      <section className="container-page py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-pink-600 to-fuchsia-600 px-6 py-14 text-center sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="relative mx-auto max-w-2xl">
            {cta.data.badge && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white">
                <Users className="size-4" /> {cta.data.badge}
              </span>
            )}
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              {cta.data.title}
            </h2>
            {cta.data.body && (
              <p className="mt-4 text-lg text-white/90">{cta.data.body}</p>
            )}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {cta.data.primaryLabel && (
                <ButtonLink
                  href={cta.data.primaryHref || "#proposal"}
                  size="lg"
                  variant="secondary"
                  className="bg-white text-rose-700 hover:bg-white/90"
                >
                  {cta.data.primaryLabel} <ArrowRight className="size-4" />
                </ButtonLink>
              )}
              {cta.data.showPhone && (
                <ButtonLink
                  href={`tel:${contact.phone}`}
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <PhoneCall className="size-4" /> {contact.phoneDisplay}
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      </section>
      )}
    </>
  );
}
