import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Star,
  Users,
  PlayCircle,
  Lock,
  BookOpen,
  Check,
  Globe,
  BarChart3,
  Clock,
  Award,
  Infinity as InfinityIcon,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import {
  getPublicCourseBySlug,
  listRecommendedCourses,
  listCourseReviews,
} from "@/server/services/course-service";
import { getSessionUser } from "@/lib/auth/api-guard";
import { isEnrolled } from "@/server/services/enrollment-service";
import { PurchasePanel } from "@/components/marketing/purchase-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CoursePreview } from "@/components/marketing/course-preview";
import { CourseReviews } from "@/components/marketing/course-reviews";
import { RecommendedCourses } from "@/components/marketing/recommended-courses";
import { ProcessSection } from "@/components/marketing/process-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { LearnerVideos } from "@/components/marketing/learner-videos";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublicCourseBySlug(slug);
  return {
    title: course?.title ?? "Course",
    description: course?.subtitle ?? undefined,
  };
}

function fmtDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await getPublicCourseBySlug(slug);
  if (!c) notFound();

  const user = await getSessionUser();
  const [enrolled, reviews, recommended] = await Promise.all([
    user ? isEnrolled(user.id, c.id) : Promise.resolve(false),
    listCourseReviews(c.id),
    listRecommendedCourses(c.id, c.category.slug),
  ]);

  const isFree = c.pricingType === "FREE";
  const effective = c.discountPrice ?? c.price;
  const priceLabel = isFree ? "Free" : `₹${effective.toLocaleString("en-IN")}`;
  const hasDiscount = !isFree && c.discountPrice != null && c.discountPrice < c.price;
  const discountPct = hasDiscount
    ? Math.round((1 - (c.discountPrice as number) / c.price) * 100)
    : 0;

  const totalSeconds = c.chapters.reduce(
    (sum, ch) => sum + ch.lessons.reduce((s, l) => s + l.durationSeconds, 0),
    0,
  );
  const previewCount = c.chapters.reduce(
    (n, ch) => n + ch.lessons.filter((l) => l.isPreview).length,
    0,
  );

  const meta = [
    c.ratingCount > 0 && {
      icon: Star,
      node: (
        <>
          <span className="font-semibold text-amber-300">{c.ratingAvg.toFixed(1)}</span>{" "}
          <span className="text-white/70">({c.ratingCount.toLocaleString("en-IN")})</span>
        </>
      ),
      iconClass: "fill-amber-300 text-amber-300",
    },
    { icon: BookOpen, node: `${c.lessonCount} lessons` },
    { icon: Users, node: `${c.enrollments.toLocaleString("en-IN")} enrolled` },
    { icon: BarChart3, node: LEVEL_LABEL[c.level] ?? c.level },
    totalSeconds > 0 && { icon: Clock, node: `${fmtDuration(totalSeconds)} of content` },
    { icon: Globe, node: c.language.toUpperCase() },
  ].filter(Boolean) as { icon: typeof Star; node: React.ReactNode; iconClass?: string }[];

  const includes = [
    { icon: PlayCircle, label: `${c.lessonCount} on-demand lessons` },
    totalSeconds > 0 && { icon: Clock, label: `${fmtDuration(totalSeconds)} of video content` },
    { icon: BarChart3, label: `${LEVEL_LABEL[c.level] ?? c.level} level` },
    { icon: Smartphone, label: "Access on mobile and desktop" },
    { icon: InfinityIcon, label: "Full lifetime access" },
    { icon: Award, label: "Certificate of completion" },
  ].filter(Boolean) as { icon: typeof Star; label: string }[];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-fuchsia-700 to-violet-800 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(60rem_30rem_at_80%_-10%,white,transparent)]"
        />
        <div className="container-page relative grid gap-8 py-12 lg:grid-cols-3 lg:pb-24 lg:pt-16">
          <div className="lg:col-span-2">
            <Badge className="mb-4 border-white/20 bg-white/15 text-white backdrop-blur">
              {c.category.name}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              {c.title}
            </h1>
            {c.subtitle && (
              <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{c.subtitle}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-sm">
              {meta.map((m, i) => (
                <span key={i} className="flex items-center gap-1.5 text-white/90">
                  <m.icon className={`size-4 ${m.iconClass ?? "text-white/70"}`} />
                  {m.node}
                </span>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Avatar className="size-9 ring-2 ring-white/30">
                {c.instructor.avatarUrl && (
                  <AvatarImage src={c.instructor.avatarUrl} alt={c.instructor.name} />
                )}
                <AvatarFallback className="bg-white/20 text-xs text-white">
                  {initials(c.instructor.name)}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm text-white/80">
                Created by{" "}
                <span className="font-medium text-white">{c.instructor.name}</span>
                {c.instructor.headline ? (
                  <span className="hidden sm:inline"> · {c.instructor.headline}</span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="container-page pb-16">
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
          {/* Sidebar — declared first so it sits near the top on mobile, and
              floats up over the hero on desktop. `self-start` keeps the aside
              its natural height (not stretched to the main column) so the
              sticky card travels with the content instead of staying pinned. */}
          <aside className="lg:col-start-3 lg:row-start-1 lg:-mt-56 lg:sticky lg:top-24 lg:self-start">
            <Card className="gap-0 overflow-hidden p-0 shadow-xl">
              <CoursePreview
                thumbnailUrl={c.thumbnailUrl}
                promoVideoUrl={c.promoVideoUrl}
                title={c.title}
              />
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className="text-3xl font-bold">{priceLabel}</span>
                  {hasDiscount && (
                    <>
                      <span className="text-muted-foreground text-lg line-through">
                        ₹{c.price.toLocaleString("en-IN")}
                      </span>
                      <Badge className="mb-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {discountPct}% off
                      </Badge>
                    </>
                  )}
                </div>

                <div className="space-y-2.5">
                  <PurchasePanel
                    courseId={c.id}
                    slug={c.slug}
                    isAuthed={Boolean(user)}
                    isEnrolled={enrolled}
                    isFree={isFree}
                    price={effective}
                  />
                  {enrolled && (
                    <p className="text-muted-foreground text-center text-xs">
                      You&apos;re enrolled in this course.
                    </p>
                  )}
                </div>

                <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                  <ShieldCheck className="size-3.5" /> 30-day money-back guarantee
                </p>

                <div className="border-t pt-4">
                  <p className="mb-3 text-sm font-semibold">This course includes</p>
                  <ul className="text-muted-foreground space-y-2.5 text-sm">
                    {includes.map((it) => (
                      <li key={it.label} className="flex items-center gap-2.5">
                        <it.icon className="size-4 shrink-0" />
                        {it.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </aside>

          {/* Main */}
          <div className="space-y-10 lg:col-span-2 lg:col-start-1 lg:row-start-1">
            {c.objectives.length > 0 && (
              <Card className="p-6">
                <h2 className="mb-4 text-xl font-semibold">What you&apos;ll learn</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {c.objectives.map((o) => (
                    <li key={o} className="flex items-start gap-2.5 text-sm">
                      <Check className="text-primary mt-0.5 size-4 shrink-0" />
                      {o}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="rounded-full px-3 py-1 font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            {c.description && (
              <div>
                <h2 className="mb-3 text-xl font-semibold">About this course</h2>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                  dangerouslySetInnerHTML={{ __html: c.description }}
                />
              </div>
            )}

            {/* Curriculum */}
            <div>
              <h2 className="mb-1 text-xl font-semibold">Curriculum</h2>
              <p className="text-muted-foreground mb-4 text-sm">
                {c.chapters.length} chapters · {c.lessonCount} lessons
                {totalSeconds ? ` · ${fmtDuration(totalSeconds)} total` : ""}
                {previewCount ? ` · ${previewCount} free preview` : ""}
              </p>
              <Card className="gap-0 overflow-hidden p-0">
                <Accordion multiple defaultValue={["0"]} className="divide-y">
                  {c.chapters.map((ch, i) => {
                    const secs = ch.lessons.reduce((s, l) => s + l.durationSeconds, 0);
                    return (
                      <AccordionItem key={ch.id} value={String(i)} className="border-b-0 px-4">
                        <AccordionTrigger className="hover:no-underline">
                          <span className="flex flex-1 items-center justify-between gap-3 pr-2">
                            <span className="font-medium">
                              {i + 1}. {ch.title}
                            </span>
                            <span className="text-muted-foreground shrink-0 text-xs font-normal">
                              {ch.lessons.length} lessons
                              {secs ? ` · ${fmtDuration(secs)}` : ""}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-0.5">
                            {ch.lessons.map((l) => (
                              <li
                                key={l.id}
                                className="flex items-center gap-3 rounded-md px-1 py-2 text-sm"
                              >
                                {l.isPreview ? (
                                  <PlayCircle className="text-primary size-4 shrink-0" />
                                ) : (
                                  <Lock className="text-muted-foreground size-4 shrink-0" />
                                )}
                                <span className="flex-1 truncate">{l.title}</span>
                                {l.isPreview && (
                                  <Badge variant="secondary" className="h-5 text-[10px]">
                                    Preview
                                  </Badge>
                                )}
                                {l.durationSeconds > 0 && (
                                  <span className="text-muted-foreground text-xs tabular-nums">
                                    {fmtDuration(l.durationSeconds)}
                                  </span>
                                )}
                              </li>
                            ))}
                            {ch.lessons.length === 0 && (
                              <li className="text-muted-foreground px-1 py-2 text-xs">
                                No lessons yet.
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </Card>
            </div>

            {c.requirements.length > 0 && (
              <div>
                <h2 className="mb-3 text-xl font-semibold">Requirements</h2>
                <ul className="text-muted-foreground space-y-2 text-sm">
                  {c.requirements.map((r) => (
                    <li key={r} className="flex items-start gap-2.5">
                      <span className="bg-muted-foreground mt-2 size-1.5 shrink-0 rounded-full" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Instructor */}
            <div>
              <h2 className="mb-3 text-xl font-semibold">Instructor</h2>
              <Card className="flex-row items-center gap-4 p-5">
                <Avatar className="size-16">
                  {c.instructor.avatarUrl && (
                    <AvatarImage src={c.instructor.avatarUrl} alt={c.instructor.name} />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-lg text-white">
                    {initials(c.instructor.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold">{c.instructor.name}</p>
                  {c.instructor.headline && (
                    <p className="text-muted-foreground text-sm">{c.instructor.headline}</p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    Instructor at SkillForCareer
                  </p>
                </div>
              </Card>
            </div>

            <CourseReviews
              reviews={reviews}
              ratingAvg={c.ratingAvg}
              ratingCount={c.ratingCount}
            />
          </div>
        </div>
      </div>

      {/* Everything below the fold is the same story the homepage tells — how
          the programme runs, what past learners say, and the questions people
          ask right before they pay. */}
      <ProcessSection className="bg-muted/30 border-y" />
      <LearnerVideos />
      <FaqSection className="border-t" />
      <RecommendedCourses courses={recommended} />
    </div>
  );
}
