import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Presentation,
  CalendarClock,
  Clock,
  Users,
  CheckCircle2,
  BadgePercent,
  ListChecks,
} from "lucide-react";
import { format } from "date-fns";
import { getPublicWebinarBySlug } from "@/server/services/webinar-service";
import { Card } from "@/components/ui/card";
import { WebinarRegisterForm } from "@/components/marketing/webinar-register-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const w = await getPublicWebinarBySlug(slug);
  return { title: w ? w.title : "Webinar", description: w?.description ?? undefined };
}

const PERKS = [
  "Live Q&A with the expert",
  "Practical, actionable takeaways",
  "Free — just register to join",
];

export default async function WebinarDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const w = await getPublicWebinarBySlug(slug);
  if (!w) notFound();

  const { isFull, seatsLeft, attendanceDiscountPercent: discount } = w;
  // One point per line in the admin form becomes one bullet here.
  const agenda = (w.agenda ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        {/* Left: details */}
        <div className="min-w-0">
          <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
            <Presentation className="size-4" /> Free masterclass
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{w.title}</h1>
          {w.topic && <p className="mt-3 text-lg font-medium text-balance">{w.topic}</p>}
          <p className="text-muted-foreground mt-2">Presented by {w.hostName}</p>

          <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {format(new Date(w.scheduledStart), "EEEE, d MMM yyyy · h:mm a")}</span>
            <span className="flex items-center gap-1.5"><Clock className="size-4" /> {w.durationMinutes} minutes</span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" /> {w.registrations} registered
              {seatsLeft != null && (
                <span className={seatsLeft === 0 ? "text-destructive" : "text-foreground font-medium"}>
                  · {seatsLeft === 0 ? "full" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
                </span>
              )}
            </span>
          </div>

          {discount > 0 && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-500/10">
              <BadgePercent className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm">
                <span className="font-semibold">Stay for the whole session, get {discount}% off.</span>{" "}
                Attend this webinar end to end and we&apos;ll send you a single-use
                code for an extra {discount}% off any SkillForCareer course.
                Attendance is tracked automatically — nothing to claim.
              </p>
            </div>
          )}

          {w.coverImageUrl && (
            <div className="mt-6 overflow-hidden rounded-2xl border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.coverImageUrl} alt={w.title} className="aspect-video w-full object-cover" />
            </div>
          )}

          {w.description && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">About this session</h2>
              <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{w.description}</p>
            </div>
          )}

          {agenda.length > 0 && (
            <div className="mt-8">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ListChecks className="size-5" /> Agenda
              </h2>
              <ul className="mt-3 space-y-2">
                {agenda.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="bg-primary/10 text-primary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-lg font-semibold">What you&apos;ll get</h2>
            <ul className="mt-3 space-y-2">
              {PERKS.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: register */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6 shadow-lg">
            <WebinarRegisterForm
              webinarId={w.id}
              isFull={isFull}
              seatsLeft={seatsLeft}
              attendanceDiscountPercent={discount}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
