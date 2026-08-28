import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarCheck,
  CalendarClock,
  Clock,
  Presentation,
  Radio,
  Ticket,
  Users,
  Video,
} from "lucide-react";
import { format } from "date-fns";
import { listUpcomingLiveBatches } from "@/server/services/batch-service";
import { listPublicWebinars } from "@/server/services/webinar-service";
import { getPageSectionsFor } from "@/server/services/page-service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ButtonLink } from "@/components/shared/button-link";
import { EmptyState } from "@/components/shared/empty-state";
import { StepList, type Step } from "@/components/marketing/step-list";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Live classes",
  description:
    "Instructor-led live batches with doubt-clearing, recordings and mentor support — see the upcoming cohorts and join the next one.",
};

export const dynamic = "force-dynamic";

const { contact } = siteConfig;

const STEPS: Step[] = [
  {
    icon: CalendarCheck,
    title: "Pick a batch",
    body: "Choose a cohort whose timing fits your week — weekday or weekend.",
  },
  {
    icon: Ticket,
    title: "Enrol & get the link",
    body: "Your seat, schedule and joining link appear in your dashboard.",
  },
  {
    icon: Video,
    title: "Attend live",
    body: "Join from any browser. Attendance is marked automatically.",
  },
  {
    icon: Award,
    title: "Finish & get certified",
    body: "Clear the assessments and download a verifiable certificate.",
  },
];

/** "19:00" → "7:00 PM" */
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function scheduleLine(schedule: { days: string[]; startTime: string; endTime: string } | null) {
  if (!schedule) return null;
  const days = schedule.days.join(", ");
  const time = [schedule.startTime, schedule.endTime]
    .filter(Boolean)
    .map(fmtTime)
    .join(" – ");
  return [days, time].filter(Boolean).join(" · ") || null;
}

export default async function LiveClassesPage() {
  const [batches, webinars, page] = await Promise.all([
    listUpcomingLiveBatches(9),
    listPublicWebinars(),
    getPageSectionsFor(["live.hero", "live.features", "live.faq"] as const),
  ]);
  const upcomingWebinars = webinars.filter((w) => !w.isPast).slice(0, 3);

  const hero = page["live.hero"];
  const features = page["live.features"];
  const faq = page["live.faq"];
  const faqItems = faq.data.items.filter((f) => f.q.trim());

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
        </div>

        <div className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            {hero.data.badge && (
              <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
                <Radio className="size-4" /> {hero.data.badge}
              </span>
            )}
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              {hero.data.titleLead}{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                {hero.data.titleHighlight}
              </span>
            </h1>
            {hero.data.subtitle && (
              <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
                {hero.data.subtitle}
              </p>
            )}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="#batches" size="lg">
                See upcoming batches <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/#enquiry" size="lg" variant="outline">
                Talk to a counsellor
              </ButtonLink>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              Prefer to call?{" "}
              <a href={`tel:${contact.phone}`} className="hover:text-foreground font-medium">
                {contact.phoneDisplay}
              </a>{" "}
              · {contact.hours}
            </p>
          </div>
        </div>
      </section>

      {/* ── What's inside a live class ───────────────────────────────────── */}
      {features.enabled && features.data.items.length > 0 && (
        <section className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">{features.data.title}</h2>
            {features.data.description && (
              <p className="text-muted-foreground mt-3">{features.data.description}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.data.items.map((item) => (
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

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-muted/30 border-y">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">How it works</h2>
            <p className="text-muted-foreground mt-3">
              From picking a cohort to holding the certificate.
            </p>
          </div>
          <StepList steps={STEPS} />
        </div>
      </section>

      {/* ── Upcoming batches ─────────────────────────────────────────────── */}
      <section id="batches" className="container-page scroll-mt-20 py-16 sm:py-20">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl">Upcoming batches</h2>
            <p className="text-muted-foreground mt-2">
              Cohorts starting soon — seats are limited to keep classes interactive.
            </p>
          </div>
          <Link
            href="/courses"
            className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            Browse all courses <ArrowRight className="size-4" />
          </Link>
        </div>

        {batches.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No batches open right now"
            description="New cohorts are announced regularly — browse the catalogue or leave your number and we'll tell you the moment one opens."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((b) => {
              const line = scheduleLine(b.schedule);
              return (
                <Link key={b.id} href={`/courses/${b.courseSlug}`} className="group block h-full">
                  <Card className="h-full gap-0 overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
                    <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-rose-500 to-pink-600">
                      {b.courseThumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.courseThumbnailUrl}
                          alt={b.courseTitle}
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-white/90">
                          <Radio className="size-10" aria-hidden />
                        </div>
                      )}
                      {/* Solid dark chip, not a tinted one — these sit on top of
                          photography, where a 10%-opacity fill is unreadable. */}
                      <Badge className="absolute top-3 left-3 gap-1.5 bg-black/55 text-white backdrop-blur-sm">
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 rounded-full",
                            b.status === "ONGOING" ? "bg-emerald-400" : "bg-amber-300",
                          )}
                        />
                        {b.status === "ONGOING" ? "Running now" : "Starting soon"}
                      </Badge>
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="line-clamp-2 leading-snug font-semibold">
                        {b.courseTitle}
                      </h3>
                      <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">{b.name}</p>

                      <dl className="text-muted-foreground mt-4 space-y-1.5 text-xs">
                        {b.startDate && (
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                            <dt className="sr-only">Starts</dt>
                            <dd>
                              {new Date(b.startDate) < new Date() ? "Started" : "Starts"}{" "}
                              {format(new Date(b.startDate), "d MMM yyyy")}
                            </dd>
                          </div>
                        )}
                        {line && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="size-3.5 shrink-0" aria-hidden />
                            <dt className="sr-only">Schedule</dt>
                            <dd>{line}</dd>
                          </div>
                        )}
                        {b.instructorName && (
                          <div className="flex items-center gap-1.5">
                            <Users className="size-3.5 shrink-0" aria-hidden />
                            <dt className="sr-only">Instructor</dt>
                            <dd className="line-clamp-1">{b.instructorName}</dd>
                          </div>
                        )}
                      </dl>

                      <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs">
                        <span className="text-muted-foreground">
                          {b.seatsLeft === null
                            ? "Open enrolment"
                            : b.seatsLeft === 0
                              ? "Batch full"
                              : `${b.seatsLeft} seats left`}
                        </span>
                        <span className="text-primary font-semibold group-hover:underline">
                          View course
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Free masterclasses (only when something is scheduled) ─────────── */}
      {upcomingWebinars.length > 0 && (
        <section className="bg-muted/30 border-y">
          <div className="container-page py-16 sm:py-20">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl sm:text-4xl">Free live masterclasses</h2>
                <p className="text-muted-foreground mt-2">
                  Sit in on a session before you commit to a full programme.
                </p>
              </div>
              <Link
                href="/webinars"
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                All webinars <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingWebinars.map((w) => (
                <Link key={w.id} href={`/webinars/${w.slug}`} className="group block h-full">
                  <Card className="h-full gap-0 p-5 transition-all group-hover:-translate-y-1 group-hover:shadow-xl">
                    <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                      <Presentation className="size-5" />
                    </span>
                    <h3 className="line-clamp-2 leading-snug font-semibold">{w.title}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">by {w.hostName}</p>
                    <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {format(new Date(w.scheduledStart), "d MMM, h:mm a")} · {w.durationMinutes} min
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {faq.enabled && faqItems.length > 0 && (
        <section className="container-page py-16 sm:py-20">
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
        </section>
      )}

    </>
  );
}
