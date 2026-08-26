import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarClock,
  GraduationCap,
  Heart,
  MapPin,
  MonitorPlay,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import { StatsBand } from "@/components/marketing/stats-band";
import { PlacedStudents } from "@/components/marketing/placed-students";
import { getHomeSection } from "@/server/services/homepage-service";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Skill For Career Academy empowers learners with practical, job-ready skills — IIT-qualified instructors, hands-on training and a modern LMS, online and offline.",
};

const { contact } = siteConfig;

const VALUES = [
  {
    icon: GraduationCap,
    title: "Taught by practitioners",
    body: "IIT-qualified educators and working professionals who teach the way the job actually works.",
  },
  {
    icon: BookOpenCheck,
    title: "Practical over theoretical",
    body: "Hands-on training built around projects, case studies and the tools employers hire for.",
  },
  {
    icon: MonitorPlay,
    title: "A real learning platform",
    body: "Notes, class recordings and resources in one dashboard — not a folder of shared links.",
  },
  {
    icon: CalendarClock,
    title: "Learn on your schedule",
    body: "Online, offline and hybrid batches with flexible timings for students and working professionals.",
  },
  {
    icon: Target,
    title: "Placement is the point",
    body: "Career guidance, interview preparation and placement support until the offer letter arrives.",
  },
  {
    icon: Heart,
    title: "Free counselling, always",
    body: "Free career guidance, course guidance and notes — before you pay us anything.",
  },
];

const WHO_WE_SERVE = [
  "Students looking for their first job",
  "Job seekers switching into tech and data roles",
  "Working professionals upgrading their skills",
  "Companies training whole teams",
];

export default async function AboutPage() {
  // The same bands the homepage shows, from the same content — edited once,
  // under Admin → Homepage.
  const [stats, placed] = await Promise.all([
    getHomeSection("stats"),
    getHomeSection("placedStudents"),
  ]);

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
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <Sparkles className="size-4" /> About us
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              Quality skill training,{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                and the job at the end of it
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
              Skill For Career Academy empowers learners with practical, job-ready skills
              through IIT-qualified instructors, hands-on training and a modern learning
              platform — online, offline and hybrid.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/courses" size="lg">
                Explore courses <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/contact" size="lg" variant="outline">
                Talk to a counsellor
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {stats.enabled && <StatsBand data={stats.data} />}

      {/* ── Story ────────────────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-xl">
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <Target className="size-4" /> Our mission
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl">
              Practicality, meet innovation
            </h2>
            <div className="text-muted-foreground mt-5 space-y-4 text-base">
              <p>
                We exist to do two things well: teach a skill properly, and help the
                learner land the job it unlocks. Everything else — the curriculum, the
                batch timings, the platform — is built backwards from that.
              </p>
              <p>
                Skill For Career Academy is an online and offline learning platform with
                IIT-based educators, an updated curriculum, flexible timings, hybrid
                classes and a dedicated LMS carrying notes, class recordings and
                resources. That combination is what prepares students, job seekers and
                working professionals for real corporate opportunities.
              </p>
            </div>

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {WHO_WE_SERVE.map((who) => (
                <li key={who} className="flex items-start gap-2.5 text-sm">
                  <UsersRound className="text-primary mt-0.5 size-4 shrink-0" />
                  {who}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border shadow-xl">
              <Image
                src="/images/students/student-19.png"
                alt="A Skill For Career learner"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
            {/* Small floating proof card — deliberately offset so the photo
                doesn't read as a stock banner. */}
            <Card className="bg-card absolute -bottom-6 left-6 max-w-[15rem] gap-0 p-4 shadow-xl sm:left-10">
              <p className="text-2xl font-bold">900+</p>
              <p className="text-muted-foreground text-xs">
                learners placed after training with us
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ── What makes us stand out ──────────────────────────────────────── */}
      <section className="bg-muted/30 border-y">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">What makes us stand out</h2>
            <p className="text-muted-foreground mt-3">
              Industry-relevant learning that helps students and professionals grow
              confidently in their careers.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="h-full gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {placed.enabled && <PlacedStudents data={placed.data} />}

      {/* ── Where to find us ─────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">Where to find us</h2>
          <p className="text-muted-foreground mt-3">
            Two centres for offline and hybrid batches — and live classes everywhere else.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
          {contact.offices.map((office) => (
            <Card key={office.label} className="h-full gap-0 p-6">
              <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                <MapPin className="size-5" />
              </span>
              <h3 className="font-semibold">{office.label}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {office.line1}
                <br />
                {office.line2}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${office.line1}, ${office.line2}`,
                )}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Open in Google Maps <ArrowRight className="size-4" />
              </a>
            </Card>
          ))}
        </div>

        <p className="text-muted-foreground mx-auto mt-8 flex max-w-4xl items-center justify-center gap-2 text-center text-xs">
          <Building2 className="size-3.5 shrink-0" aria-hidden />
          Skill For Career is a brand of Webeside Technology · GST 06CEWPB0138N1Z8
        </p>
      </section>

    </>
  );
}
