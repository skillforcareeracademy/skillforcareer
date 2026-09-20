import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  FileCheck2,
  Handshake,
  MapPin,
  PhoneCall,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { CareerApplicationForm } from "@/components/marketing/career-application-form";
import { getOpenRole, listApplyCourses } from "@/server/services/careers-service";
import { EXPERIENCE_LEVEL_LABELS, JOB_MODE_LABELS } from "@/lib/validations/careers";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Send your CV",
  description:
    "Send your CV to the Skill For Career placement team — with your course, batch and the job you want — and we'll match you with our hiring partners.",
};
export const dynamic = "force-dynamic";

const { contact } = siteConfig;

const NEXT_STEPS = [
  {
    icon: FileCheck2,
    title: "We read your CV",
    body: "It lands with our placement team the moment you send it — with a confirmation in your inbox.",
  },
  {
    icon: SearchCheck,
    title: "We match you",
    body: "Against open roles with our hiring partners, by course, experience, city and job mode.",
  },
  {
    icon: Handshake,
    title: "We put you forward",
    body: "Directly, or through our placement partners — and we call you before each interview.",
  },
];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined;
}

export default async function CareersApplyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const postId = str(sp.post);
  const [courses, post] = await Promise.all([
    listApplyCourses(),
    postId ? getOpenRole(postId) : null,
  ]);

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -top-24 right-0 size-[26rem] rounded-full bg-rose-500/10 blur-3xl" />
      </div>

      <div className="container-page py-10 sm:py-14">
        <Link
          href="/careers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> Careers
        </Link>

        <div className="mt-4 max-w-2xl">
          <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
            <Sparkles className="size-4" /> Placement support
          </span>
          <h1 className="mt-4 text-3xl leading-tight font-bold sm:text-4xl">Send your CV</h1>
          <p className="text-muted-foreground mt-3 text-lg text-pretty">
            Tell us about your training and the job you want. Your CV goes straight to our
            placement team — no email needed.
          </p>
        </div>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {post && (
              <div className="bg-card flex items-start gap-3 rounded-2xl border p-4 shadow-sm sm:p-5">
                <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                  <Briefcase className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Applying for
                  </p>
                  <p className="font-semibold">{post.title}</p>
                  <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-3.5" /> {post.company}
                    </span>
                    <span>{EXPERIENCE_LEVEL_LABELS[post.level]}</span>
                    {post.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" /> {post.location}
                      </span>
                    )}
                    {post.mode && <span>{JOB_MODE_LABELS[post.mode]}</span>}
                  </p>
                </div>
              </div>
            )}

            <CareerApplicationForm
              courses={courses}
              role={str(sp.role)}
              post={
                post
                  ? { id: post.id, title: post.title, company: post.company, level: post.level }
                  : null
              }
            />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="bg-card rounded-2xl border p-5 shadow-sm">
              <h2 className="font-semibold">What happens next</h2>
              <ol className="mt-4 space-y-4">
                {NEXT_STEPS.map(({ icon: Icon, title, body }, i) => (
                  <li key={title} className="flex gap-3">
                    <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {i + 1}. {title}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-sm">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border bg-gradient-to-br from-rose-500/10 to-fuchsia-500/10 p-5">
              <p className="text-sm font-medium">Questions about placements?</p>
              <p className="text-muted-foreground mt-1 text-sm">{contact.hours}</p>
              <a
                href={`tel:${contact.phone}`}
                className="text-primary mt-3 inline-flex items-center gap-2 text-sm font-semibold hover:underline"
              >
                <PhoneCall className="size-4" /> {contact.phoneDisplay}
              </a>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
