import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  ClipboardList,
  Code2,
  FileText,
  GraduationCap,
  Handshake,
  HeartHandshake,
  IndianRupee,
  MapPin,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Rocket,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import { StepList, type Step } from "@/components/marketing/step-list";
import { siteConfig } from "@/config/site";
import { listOpenRoles } from "@/server/services/careers-service";
import { EXPERIENCE_LEVEL_LABELS, JOB_MODE_LABELS } from "@/lib/validations/careers";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Work at Skill For Career Academy — teaching, counselling, marketing, engineering and student success roles across Faridabad, Greater Noida and remote.",
};

// The open-roles band below reads hiring partners' posts live.
export const dynamic = "force-dynamic";

const { contact } = siteConfig;

/**
 * Every CV on this page goes through the application form, not a mailto: the
 * client asked for CVs to "receive in our system", where the placement team
 * tracks them (Admin → Careers). A role, when there is one, rides along so the
 * form opens with "job you're looking for" already filled in.
 */
const APPLY_HREF = "/careers/apply";
function applyHref(role: string): string {
  return `${APPLY_HREF}?role=${encodeURIComponent(role)}`;
}

const TEAMS = [
  {
    icon: GraduationCap,
    title: "Trainers & instructors",
    body: "Teach live batches in development, data, design, marketing or medical coding — full-time or visiting.",
    tags: ["Faridabad", "Greater Noida", "Online"],
  },
  {
    icon: PhoneCall,
    title: "Admissions & counselling",
    body: "Guide learners to the right programme, and stay with them from the first call to enrolment.",
    tags: ["Faridabad", "Greater Noida"],
  },
  {
    icon: HeartHandshake,
    title: "Student success",
    body: "Keep batches on track — attendance, doubt resolution, mentoring and placement preparation.",
    tags: ["Faridabad", "Hybrid"],
  },
  {
    icon: Megaphone,
    title: "Marketing & content",
    body: "Performance marketing, social, SEO and content that reaches learners who need us.",
    tags: ["Faridabad", "Hybrid"],
  },
  {
    icon: Code2,
    title: "Engineering & product",
    body: "Build the learning platform itself — the LMS, live classes, assessments and dashboards.",
    tags: ["Remote", "Hybrid"],
  },
  {
    icon: Handshake,
    title: "Placements & partnerships",
    body: "Grow the hiring-partner network and put trained learners in front of the right companies.",
    tags: ["Faridabad", "Greater Noida"],
  },
];

const PERKS = [
  {
    icon: TrendingUp,
    title: "Work that compounds",
    body: "Every batch you touch shows up as somebody's first offer letter. The impact is easy to see.",
  },
  {
    icon: Rocket,
    title: "Room to own things",
    body: "Small teams, short decision chains. If you want responsibility, it is there to take.",
  },
  {
    icon: BadgeCheck,
    title: "Learn on the house",
    body: "Free access to every programme we run, for you and your immediate family.",
  },
  {
    icon: Users,
    title: "People who teach",
    body: "You'll sit with practitioners who explain their craft for a living — it rubs off.",
  },
];

const HIRING: Step[] = [
  {
    icon: FileText,
    title: "Send your CV",
    body: "Fill in a short form and attach your CV. We read everything that arrives.",
  },
  {
    icon: MessageSquare,
    title: "Intro call",
    body: "A short conversation about your experience and what you want to do next.",
  },
  {
    icon: ClipboardList,
    title: "Skills round",
    body: "A demo class, a work sample or a task — whatever fits the role you applied for.",
  },
  {
    icon: Briefcase,
    title: "Offer & onboarding",
    body: "Terms, start date, and a proper first week with the team you'll be working in.",
  },
];

export default async function CareersPage() {
  const openRoles = await listOpenRoles();

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-rose-500/15 blur-3xl" />
        </div>

        <div className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <Sparkles className="size-4" /> Careers
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              Build careers.{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                Starting with your own
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
              We train people for the jobs the market is actually hiring for. If that is
              work you want to do — teaching it, selling it, supporting it or building the
              platform behind it — we&apos;d like to hear from you.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="#teams" size="lg">
                See where we hire <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href={APPLY_HREF} size="lg" variant="outline">
                <Send className="size-4" /> Send your CV
              </ButtonLink>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              No live vacancy that fits? Send your CV anyway — we keep good CVs on file and
              come back when a matching role opens.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why join ─────────────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">Why work here</h2>
          <p className="text-muted-foreground mt-3">
            An academy small enough to know everyone, busy enough to keep you learning.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full gap-0 p-6">
              <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                <Icon className="size-5" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Teams we hire into ───────────────────────────────────────────── */}
      <section id="teams" className="bg-muted/30 scroll-mt-20 border-y">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">Where we hire</h2>
            <p className="text-muted-foreground mt-3">
              These are the teams we recruit into through the year. Tell us which one fits
              you and we&apos;ll take it from there.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEAMS.map(({ icon: Icon, title, body, tags }) => (
              <Card key={title} className="flex h-full flex-col gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <Link
                  href={applyHref(title)}
                  className="text-primary mt-5 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                >
                  Apply for this team <ArrowRight className="size-4" />
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open roles with hiring partners ───────────────────────────────── */}
      {openRoles.length > 0 && (
        <section id="open-roles" className="container-page scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">Open roles with our hiring partners</h2>
            <p className="text-muted-foreground mt-3">
              Companies that hire our learners are filling these now. Apply here and
              our placement team puts you forward.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {openRoles.map((role) => (
              <Card key={role.id} className="flex h-full flex-col gap-0 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
                    <Briefcase className="size-5" />
                  </span>
                  <span
                    className={
                      role.level === "FRESHER"
                        ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                        : "rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400"
                    }
                  >
                    {EXPERIENCE_LEVEL_LABELS[role.level]}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold">{role.title}</h3>
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                  <Building2 className="size-3.5 shrink-0" /> {role.company}
                </p>
                {role.description && (
                  <p className="text-muted-foreground mt-3 line-clamp-3 text-sm">
                    {role.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {role.location && (
                    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                      <MapPin className="size-3" /> {role.location}
                    </span>
                  )}
                  {role.mode && (
                    <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {JOB_MODE_LABELS[role.mode]}
                    </span>
                  )}
                  {role.salary && (
                    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                      <IndianRupee className="size-3" /> {role.salary}
                    </span>
                  )}
                  {role.openings != null && role.openings > 0 && (
                    <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {role.openings} {role.openings === 1 ? "opening" : "openings"}
                    </span>
                  )}
                </div>

                <Link
                  href={`${APPLY_HREF}?post=${encodeURIComponent(role.id)}`}
                  className="text-primary mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold hover:underline"
                >
                  Apply for this role <ArrowRight className="size-4" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Hiring process ───────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">How hiring works</h2>
          <p className="text-muted-foreground mt-3">
            Four steps, and we tell you where you stand at each one.
          </p>
        </div>
        <StepList steps={HIRING} />
      </section>

      {/* ── Apply ────────────────────────────────────────────────────────── */}
      <section className="container-page pb-16 sm:pb-20">
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
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to apply?
            </h2>
            <p className="mt-4 text-lg text-white/90">
              Send your CV with the role you&apos;re after, the city you can work from and
              when you can start. It goes straight to our team.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink
                href={APPLY_HREF}
                size="lg"
                variant="secondary"
                className="bg-white text-rose-700 hover:bg-white/90"
              >
                <Send className="size-4" /> Send your CV
              </ButtonLink>
              <ButtonLink
                href={`tel:${contact.phone}`}
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <PhoneCall className="size-4" /> {contact.phoneDisplay}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
