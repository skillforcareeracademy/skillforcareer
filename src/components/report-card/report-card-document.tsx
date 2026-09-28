import { format } from "date-fns";
import type { StudentScorecard } from "@/server/services/performance-service";

/**
 * A learner's report card, course by course.
 *
 * "Student ka report card hona chahiye, course wise, ek alag tab me, aur admin
 * se download ho." One document serves all three: the learner's own tab, the
 * office's copy of it, and the printed PDF — so a figure can never differ
 * between them. Print styles live on the pages that render it; everything here
 * is plain markup that survives a printer.
 */

export interface ReportCardLearner {
  name: string;
  email: string;
  phone: string | null;
  joinedAt: string;
}

const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");
const dayTime = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy, h:mm a") : "—");
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

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-[11px]">{note}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 break-inside-avoid">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function ReportCardDocument({
  learner,
  card,
  academyName,
  generatedAt,
}: {
  learner: ReportCardLearner;
  card: StudentScorecard;
  academyName: string;
  generatedAt: Date;
}) {
  const { totals, attendance, classes, notes, assignments, quizzes, webinars, referrals, fees } =
    card;

  return (
    <div id="report-card" className="bg-background mx-auto max-w-4xl space-y-6 rounded-2xl border p-6 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-muted-foreground text-xs tracking-widest uppercase">
            {academyName}
          </p>
          <h2 className="text-xl font-semibold">Report card</h2>
          <p className="text-muted-foreground text-sm">
            {learner.name} · {learner.email}
            {learner.phone ? ` · ${learner.phone}` : ""}
          </p>
        </div>
        <div className="text-muted-foreground text-right text-xs">
          <p>Enrolled since {day(learner.joinedAt)}</p>
          <p>Prepared {dayTime(generatedAt.toISOString())}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure
          label="Courses"
          value={String(totals.enrolled)}
          note={`${totals.completed} completed`}
        />
        <Figure
          label="Attendance"
          value={percent(attendance.percent)}
          note={`${attendance.attended} of ${attendance.held} classes`}
        />
        <Figure
          label="Quiz average"
          value={percent(quizzes.avgPercent)}
          note={`${quizzes.taken} attempted · best ${percent(quizzes.bestPercent)}`}
        />
        <Figure
          label="Assignments"
          value={percent(assignments.avgPercent)}
          note={`${assignments.submitted} submitted · ${assignments.pending} pending`}
        />
      </div>

      <Section title="Course by course">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="border p-2 font-medium">Course</th>
                <th className="border p-2 font-medium">Batch</th>
                <th className="border p-2 text-right font-medium">Lessons</th>
                <th className="border p-2 text-right font-medium">Progress</th>
                <th className="border p-2 text-right font-medium">Attendance</th>
                <th className="border p-2 text-right font-medium">Assignments</th>
                <th className="border p-2 text-right font-medium">Quizzes</th>
                <th className="border p-2 font-medium">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {card.courses.length === 0 ? (
                <tr>
                  <td className="text-muted-foreground border p-3 text-center" colSpan={8}>
                    No courses yet.
                  </td>
                </tr>
              ) : (
                card.courses.map((c) => (
                  <tr key={c.enrollmentId}>
                    <td className="border p-2">
                      <span className="font-medium">{c.courseTitle}</span>
                      <span className="text-muted-foreground block text-[11px]">
                        Joined {day(c.enrolledAt)}
                      </span>
                    </td>
                    <td className="border p-2">{c.batchName ?? "—"}</td>
                    <td className="border p-2 text-right tabular-nums">
                      {c.lessonsCompleted}/{c.lessonsTotal}
                    </td>
                    <td className="border p-2 text-right tabular-nums">{c.progressPercent}%</td>
                    <td className="border p-2 text-right tabular-nums">
                      {percent(c.attendancePercent)}
                      <span className="text-muted-foreground block text-[11px]">
                        {c.classesAttended}/{c.classesHeld}
                      </span>
                    </td>
                    <td className="border p-2 text-right tabular-nums">
                      {percent(c.assignmentAvgPercent)}
                      <span className="text-muted-foreground block text-[11px]">
                        {c.assignmentsSubmitted} submitted
                      </span>
                    </td>
                    <td className="border p-2 text-right tabular-nums">
                      {percent(c.quizAvgPercent)}
                      <span className="text-muted-foreground block text-[11px]">
                        {c.quizzesTaken} attempted
                      </span>
                    </td>
                    <td className="border p-2 text-[11px]">{c.certificateSerial ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Classes">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Attended</dt>
              <dd className="tabular-nums">
                {attendance.attended} of {attendance.held}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Still to come</dt>
              <dd className="tabular-nums">{classes.pending}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last class</dt>
              <dd className="text-right">
                {classes.last ? `${classes.last.title} · ${dayTime(classes.last.scheduledStart)}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Next class</dt>
              <dd className="text-right">
                {classes.next ? `${classes.next.title} · ${dayTime(classes.next.scheduledStart)}` : "—"}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Study time">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Lessons watched</dt>
              <dd className="tabular-nums">{duration(totals.watchSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Notes read</dt>
              <dd className="tabular-nums">
                {duration(notes.seconds)}
                {notes.notesShared > 0 ? ` (${notes.notesRead} of ${notes.notesShared})` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Time on quizzes</dt>
              <dd className="tabular-nums">{duration(quizzes.timeSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Webinars attended</dt>
              <dd className="tabular-nums">
                {webinars.attended} of {webinars.registered}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Fees">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{FEE_LABEL[fees.status]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Billed</dt>
              <dd className="tabular-nums">{inr(fees.billed)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">{inr(fees.paid)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Pending</dt>
              <dd className="tabular-nums">{inr(fees.due)}</dd>
            </div>
            {fees.nextDueDate && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Next instalment</dt>
                <dd className="tabular-nums">
                  {inr(fees.nextDueAmount ?? 0)} · {day(fees.nextDueDate)}
                </dd>
              </div>
            )}
          </dl>
        </Section>

        <Section title="Refer and earn">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Friends referred</dt>
              <dd className="tabular-nums">{referrals.invited}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Joined</dt>
              <dd className="tabular-nums">{referrals.joined}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Earned</dt>
              <dd className="tabular-nums">{inr(referrals.earned)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Wallet balance</dt>
              <dd className="tabular-nums">{inr(referrals.walletBalance)}</dd>
            </div>
          </dl>
        </Section>
      </div>

      <p className="text-muted-foreground border-t pt-3 text-[11px]">
        Figures are taken from the panel at the moment this card was prepared —
        attendance from the class register, marks from submitted work, and fees
        from the invoices raised against this learner.
      </p>
    </div>
  );
}
