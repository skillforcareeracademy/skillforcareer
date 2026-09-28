import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileQuestion,
  NotebookPen,
  Presentation,
  Receipt,
  Share2,
  Video,
} from "lucide-react";
import type { StudentScorecard } from "@/server/services/performance-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";

/**
 * "Student ke panel me uski performance dikhni chahiye."
 *
 * The figures the academy listed, on the learner's own dashboard: attendance,
 * classes, reading time, assignments, quizzes, webinars, referrals and fees.
 * Each one links to the page that explains it, and the whole lot prints from
 * the report card.
 */

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const percent = (v: number | null) => (v == null ? "—" : `${v}%`);

function duration(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
}

const FEE_LABEL: Record<StudentScorecard["fees"]["status"], string> = {
  PAID: "Paid in full",
  PARTIAL: "Part paid",
  UNPAID: "Unpaid",
  NONE: "Nothing billed",
};

function Tile({
  href,
  icon: Icon,
  label,
  value,
  note,
}: {
  href: string;
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-accent/50 focus-visible:ring-ring flex items-start gap-3 rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon className="text-muted-foreground size-4" />
      </span>
      <span className="min-w-0">
        <span className="text-muted-foreground block text-[11px] tracking-wide uppercase">
          {label}
        </span>
        <span className="block text-base font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground block truncate text-xs">{note}</span>
      </span>
    </Link>
  );
}

export function PerformanceBlock({ card }: { card: StudentScorecard }) {
  const { attendance, classes, notes, assignments, quizzes, webinars, referrals, fees } = card;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Your performance</CardTitle>
          <CardDescription>
            Attendance, marks, reading time and fees — all in one place.
          </CardDescription>
        </div>
        <ButtonLink href="/student/report-card" variant="outline" size="sm">
          Report card <ArrowRight className="size-4" />
        </ButtonLink>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            href="/student/attendance"
            icon={CalendarCheck}
            label="Attendance"
            value={percent(attendance.percent)}
            note={`${attendance.attended} of ${attendance.held} classes attended`}
          />
          <Tile
            href="/student/quizzes"
            icon={FileQuestion}
            label="Quizzes"
            value={percent(quizzes.avgPercent)}
            note={`${quizzes.taken} practised · best ${percent(quizzes.bestPercent)}`}
          />
          <Tile
            href="/student/assignments"
            icon={ClipboardList}
            label="Assignments"
            value={percent(assignments.avgPercent)}
            note={`${assignments.submitted} submitted · ${assignments.pending} pending`}
          />
          <Tile
            href="/student/learning#batch-notes"
            icon={NotebookPen}
            label="Notes read"
            value={duration(notes.seconds)}
            note={
              notes.notesShared > 0
                ? `${notes.notesRead} of ${notes.notesShared} notes opened`
                : "Nothing shared with your batch yet"
            }
          />
          <Tile
            href="/student/live"
            icon={CalendarClock}
            label="Classes to come"
            value={String(classes.pending)}
            note={
              classes.next
                ? `Next: ${format(new Date(classes.next.scheduledStart), "EEE d MMM, h:mm a")}`
                : "Nothing on the timetable"
            }
          />
          <Tile
            href="/student/webinars"
            icon={Presentation}
            label="Webinars"
            value={`${webinars.attended}/${webinars.registered}`}
            note="Attended out of registered"
          />
          <Tile
            href="/student/wallet"
            icon={Share2}
            label="Referral earnings"
            value={inr(referrals.earned)}
            note={`${referrals.joined} of ${referrals.invited} friends joined · wallet ${inr(referrals.walletBalance)}`}
          />
          <Tile
            href="/student/payments"
            icon={Receipt}
            label="Fees"
            value={fees.due > 0 ? inr(fees.due) : FEE_LABEL[fees.status]}
            note={fees.due > 0 ? `Pending of ${inr(fees.billed)} billed` : `${inr(fees.paid)} paid`}
          />
        </div>

        {(classes.next || classes.last) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.next && (
              <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-3">
                <Video className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{classes.next.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    Next class · {format(new Date(classes.next.scheduledStart), "EEE d MMM, h:mm a")}
                  </p>
                </div>
                <ButtonLink href={`/live/room/${classes.next.roomCode}`} size="sm" variant="outline">
                  Open
                </ButtonLink>
              </div>
            )}
            {classes.last && (
              <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-3">
                <Video className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{classes.last.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    Last class · {format(new Date(classes.last.scheduledStart), "EEE d MMM, h:mm a")}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Held
                </Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
