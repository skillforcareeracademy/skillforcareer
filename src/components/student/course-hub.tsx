import Link from "next/link";
import { format } from "date-fns";
import {
  BookMarked,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  Layers,
  NotebookPen,
  PlayCircle,
  Presentation,
  Radio,
  Users,
  Video,
} from "lucide-react";
import type { CourseHub } from "@/server/services/course-hub-service";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/shared/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { scheduleLabel } from "@/components/admin/batches/profile/format";

/**
 * The course's own home: what it covers, who teaches it, when the classes are,
 * and everything set for it — lectures, notes, assignments, quizzes, recordings.
 * Each section is a summary that links on to the page that owns the detail.
 */

const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");
const dayTime = (iso: string) => format(new Date(iso), "EEE d MMM, h:mm a");

function minutes(seconds: number): string {
  if (seconds <= 0) return "";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof Layers;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="text-muted-foreground size-4" /> {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-2 text-sm">{children}</p>;
}

export function CourseHubView({ hub }: { hub: CourseHub }) {
  const { course, enrolment, batch } = hub;
  const percent =
    enrolment.lessonsTotal > 0
      ? Math.round((enrolment.lessonsCompleted / enrolment.lessonsTotal) * 100)
      : enrolment.progressPercent;

  return (
    <div className="space-y-6">
      {/* Where they are, and the way back in. */}
      <Card>
        <CardContent className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {course.categoryName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {course.categoryName}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {course.deliveryMode.charAt(0) +
                    course.deliveryMode.slice(1).toLowerCase().replace(/_/g, " ")}
                </Badge>
                {percent >= 100 && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="size-3" /> Completed
                  </Badge>
                )}
              </div>
              <h2 className="text-xl font-semibold">{course.title}</h2>
              <p className="text-muted-foreground text-sm">
                {course.instructorName ? `Taught by ${course.instructorName} · ` : ""}
                Joined {day(enrolment.enrolledAt)}
              </p>
            </div>
            <div className="max-w-md space-y-1.5">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {enrolment.lessonsCompleted}/{enrolment.lessonsTotal} lessons
                </span>
                <span className="tabular-nums">{percent}%</span>
              </div>
              <Progress value={percent} />
            </div>
          </div>
          <ButtonLink href={`/student/learn/${course.slug}`} className="shrink-0">
            <PlayCircle className="size-4" />
            {percent > 0 ? "Continue learning" : "Start learning"}
          </ButtonLink>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Batch ─────────────────────────────────────────────────────── */}
        <Section
          icon={Users}
          title="Your batch"
          description={batch ? batch.name : "You aren't in a cohort for this course."}
        >
          {batch ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Runs</dt>
                <dd className="text-right">
                  {day(batch.startDate)} – {day(batch.endDate)}
                </dd>
              </div>
              {scheduleLabel(batch.schedule) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Timetable</dt>
                  <dd className="text-right">{scheduleLabel(batch.schedule)}</dd>
                </div>
              )}
              {batch.instructorName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Instructor</dt>
                  <dd className="text-right">{batch.instructorName}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Attendance</dt>
                <dd className="text-right tabular-nums">
                  {batch.attendancePercent == null
                    ? "—"
                    : `${batch.attendancePercent}% · ${batch.classesAttended}/${batch.classesHeld}`}
                </dd>
              </div>
            </dl>
          ) : (
            <Empty>Ask the office to place you in a batch to get a timetable.</Empty>
          )}
        </Section>

        {/* ── Upcoming classes ──────────────────────────────────────────── */}
        <Section
          icon={CalendarClock}
          title="Upcoming classes"
          description={`${hub.upcomingClasses.length} scheduled`}
          action={
            <ButtonLink href="/student/live" variant="ghost" size="sm">
              All classes
            </ButtonLink>
          }
        >
          {hub.upcomingClasses.length === 0 ? (
            <Empty>Nothing on the timetable just now.</Empty>
          ) : (
            <ul className="space-y-3">
              {hub.upcomingClasses.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      {c.phase === "live" && (
                        <Badge className="gap-1 bg-rose-600 text-[10px] text-white">
                          <Radio className="size-2.5" /> LIVE
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {dayTime(c.scheduledStart)}
                    </p>
                  </div>
                  {c.joinLinkOpen ? (
                    <ButtonLink
                      href={`/live/room/${c.roomCode}`}
                      size="sm"
                      variant={c.phase === "live" ? "default" : "outline"}
                    >
                      Join
                    </ButtonLink>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      Link opens {format(new Date(c.joinLinkOpensAt), "d MMM, h:mm a")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ── Curriculum ──────────────────────────────────────────────────── */}
      {hub.curriculums.length > 0 && (
        <Section
          icon={BookMarked}
          title="Curriculum"
          description="What this course covers, as the academy has set it out."
          action={
            <ButtonLink href="/student/curriculum" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          <Accordion className="space-y-2">
            {hub.curriculums.map((c) => (
              <AccordionItem key={c.id} value={c.id} className="rounded-xl border px-3">
                <AccordionTrigger className="py-3 text-sm font-medium">
                  {c.title}
                  {c.year ? ` · ${c.year}` : ""}
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {c.tabs.length === 0 ? (
                    <Empty>Nothing written up yet.</Empty>
                  ) : (
                    <ul className="space-y-2">
                      {c.tabs.map((t) => (
                        <li key={t.id}>
                          <p className="text-sm font-medium">{t.heading}</p>
                          {t.description && (
                            <p className="text-muted-foreground text-sm whitespace-pre-line">
                              {t.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>
      )}

      {/* ── Lectures ────────────────────────────────────────────────────── */}
      <Section
        icon={Layers}
        title="Lectures"
        description={`${enrolment.lessonsTotal} lessons across ${hub.chapters.length} sections`}
        action={
          <ButtonLink href={`/student/learn/${course.slug}`} variant="ghost" size="sm">
            Open player
          </ButtonLink>
        }
      >
        {hub.chapters.length === 0 ? (
          <Empty>The lessons for this course aren&apos;t published yet.</Empty>
        ) : (
          <Accordion className="space-y-2">
            {hub.chapters.map((ch) => {
              const done = ch.lessons.filter((l) => l.completed).length;
              return (
                <AccordionItem key={ch.id} value={ch.id} className="rounded-xl border px-3">
                  <AccordionTrigger className="py-3 text-sm font-medium">
                    <span className="flex w-full items-center justify-between gap-3 pr-2">
                      <span className="truncate">{ch.title}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {done}/{ch.lessons.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <ul className="divide-y">
                      {ch.lessons.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={`/student/learn/${course.slug}`}
                            className="hover:bg-accent/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
                          >
                            {l.completed ? (
                              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                            ) : (
                              <PlayCircle className="text-muted-foreground size-4 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {minutes(l.durationSeconds)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Assignments ───────────────────────────────────────────────── */}
        <Section
          icon={ClipboardList}
          title="Assignments"
          description={`${hub.assignments.length} set for this course`}
          action={
            <ButtonLink href="/student/assignments" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          {hub.assignments.length === 0 ? (
            <Empty>Nothing set yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {hub.assignments.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.dueDate ? `Due ${day(a.dueDate)}` : "No due date"}
                      {a.submission?.score != null ? ` · scored ${a.submission.score}/${a.maxScore}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {a.submission
                      ? a.submission.status.charAt(0) +
                        a.submission.status.slice(1).toLowerCase().replace(/_/g, " ")
                      : a.isOverdue
                        ? "Overdue"
                        : "To do"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Quizzes ───────────────────────────────────────────────────── */}
        <Section
          icon={FileQuestion}
          title="Quizzes"
          description={`${hub.quizzes.length} for this course`}
          action={
            <ButtonLink href="/student/quizzes" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          {hub.quizzes.length === 0 ? (
            <Empty>Nothing to practise yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {hub.quizzes.slice(0, 6).map((q) => (
                <li key={q.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{q.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {q.categoryName ? `${q.categoryName} · ` : ""}
                      {q.questionCount} questions
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums">
                    {q.bestPercent == null ? "—" : `${q.bestPercent}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <Section
          icon={NotebookPen}
          title="Notes and material"
          description={`${hub.notes.length} shared with your batch`}
          action={
            <ButtonLink href="/student/learning#batch-notes" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          {hub.notes.length === 0 ? (
            <Empty>Your instructor hasn&apos;t shared anything yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {hub.notes.slice(0, 6).map((n) => (
                <li key={n.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <p className="text-muted-foreground text-xs">{day(n.createdAt)}</p>
                  </div>
                  {n.readSeconds > 0 && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Read
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Recordings ────────────────────────────────────────────────── */}
        <Section
          icon={Video}
          title="Class recordings"
          description={`${hub.recordings.length} available to you`}
          action={
            <ButtonLink href="/student/live" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          {hub.recordings.length === 0 ? (
            <Empty>No recordings released for this course yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {hub.recordings.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-muted-foreground text-xs">{day(r.scheduledStart)}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[10px]"
                    title={r.recording.message ?? undefined}
                  >
                    {r.recording.canWatch ? "Watch" : "Locked"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ── Webinars ────────────────────────────────────────────────────── */}
      {hub.webinars.length > 0 && (
        <Section
          icon={Presentation}
          title="Webinars coming up"
          description="Open to every learner at the academy."
          action={
            <ButtonLink href="/student/webinars" variant="ghost" size="sm">
              Open
            </ButtonLink>
          }
        >
          <ul className="space-y-2">
            {hub.webinars.map((w) => (
              <li key={w.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.title}</p>
                  <p className="text-muted-foreground text-xs">{dayTime(w.scheduledStart)}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {w.registered ? "Registered" : "Open"}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <GraduationCap className="size-3.5" />
        Attendance, marks and reading time for every course are on your{" "}
        <Link href="/student/report-card" className="text-primary hover:underline">
          report card
        </Link>
        .
      </p>
    </div>
  );
}
