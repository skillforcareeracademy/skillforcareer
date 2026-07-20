import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Presentation, CalendarClock, Clock, Users, CheckCircle2 } from "lucide-react";
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

  const isFull = w.capacity != null && w.registrations >= w.capacity;

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        {/* Left: details */}
        <div className="min-w-0">
          <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
            <Presentation className="size-4" /> Free masterclass
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{w.title}</h1>
          <p className="text-muted-foreground mt-2">Presented by {w.hostName}</p>

          <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {format(new Date(w.scheduledStart), "EEEE, d MMM yyyy · h:mm a")}</span>
            <span className="flex items-center gap-1.5"><Clock className="size-4" /> {w.durationMinutes} minutes</span>
            <span className="flex items-center gap-1.5"><Users className="size-4" /> {w.registrations} registered</span>
          </div>

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
            <WebinarRegisterForm webinarId={w.id} isFull={isFull} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
