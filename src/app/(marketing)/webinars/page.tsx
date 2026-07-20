import type { Metadata } from "next";
import Link from "next/link";
import { Presentation, CalendarClock, Clock, Users } from "lucide-react";
import { format } from "date-fns";
import { listPublicWebinars } from "@/server/services/webinar-service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = {
  title: "Webinars & masterclasses",
  description: "Free live webinars and masterclasses from SkillForCareer experts.",
};
export const dynamic = "force-dynamic";

export default async function WebinarsCatalogPage() {
  const webinars = await listPublicWebinars();
  const upcoming = webinars.filter((w) => !w.isPast);
  const past = webinars.filter((w) => w.isPast);

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mb-10 max-w-2xl">
        <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
          <Presentation className="size-4" /> Free masterclasses
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Webinars & masterclasses</h1>
        <p className="text-muted-foreground mt-2">
          Live sessions with industry experts — register free and level up your skills.
        </p>
      </div>

      {webinars.length === 0 ? (
        <EmptyState icon={Presentation} title="No webinars scheduled" description="Check back soon — new masterclasses are added regularly." />
      ) : (
        <div className="space-y-12">
          {upcoming.length > 0 && <WebinarGrid title="Upcoming" items={upcoming} />}
          {past.length > 0 && <WebinarGrid title="Past webinars" items={past} muted />}
        </div>
      )}
    </div>
  );
}

function WebinarGrid({
  title,
  items,
  muted,
}: {
  title: string;
  items: Awaited<ReturnType<typeof listPublicWebinars>>;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-5 text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((w) => (
          <Link key={w.id} href={`/webinars/${w.slug}`} className="group block h-full">
            <Card className={`h-full gap-0 overflow-hidden p-0 transition-all group-hover:-translate-y-1 group-hover:shadow-xl ${muted ? "opacity-80" : ""}`}>
              <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-rose-500 to-pink-600">
                {w.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.coverImageUrl} alt={w.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex size-full items-center justify-center text-white/90">
                    <Presentation className="size-10" />
                  </div>
                )}
                {w.isPast && <Badge className="absolute top-3 left-3 bg-black/50 text-white">Ended</Badge>}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-2 leading-snug font-semibold">{w.title}</h3>
                <p className="text-muted-foreground mt-1 text-xs">by {w.hostName}</p>
                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1"><CalendarClock className="size-3.5" /> {format(new Date(w.scheduledStart), "d MMM, h:mm a")}</span>
                  <span className="flex items-center gap-1"><Clock className="size-3.5" /> {w.durationMinutes} min</span>
                  {w.registrations > 0 && <span className="flex items-center gap-1"><Users className="size-3.5" /> {w.registrations}</span>}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
