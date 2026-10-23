import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { PartyPopper, CalendarOff } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { listHolidays } from "@/server/services/holiday-service";
import { istToday } from "@/lib/ist";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Holidays" };
export const dynamic = "force-dynamic";

/** The academy's holiday calendar, read-only — the learner's "Holidays" tab. */
export default async function StudentHolidaysPage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const year = Number(istToday().slice(0, 4));
  const today = istToday();
  const holidays = await listHolidays(year);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description={`The academy's holiday calendar for ${year}.`}
      />

      {holidays.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="No holidays listed yet"
          description="The academy hasn't added any holidays for this year."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {holidays.map((h) => {
            const past = h.date < today;
            const date = parseISO(h.date);
            return (
              <li
                key={h.id}
                className={cn(
                  "flex items-start gap-4 p-4",
                  past && "opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border text-center",
                    past
                      ? "bg-muted/40"
                      : "border-primary/20 bg-primary/5 text-primary",
                  )}
                >
                  <span className="text-lg leading-none font-semibold">
                    {format(date, "d")}
                  </span>
                  <span className="text-[10px] tracking-wide uppercase">
                    {format(date, "MMM")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{h.name}</p>
                    {h.noClasses && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CalendarOff className="size-3" /> No classes
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {format(date, "EEEE, d MMMM yyyy")}
                  </p>
                  {h.message && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {h.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
