"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Award,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileQuestion,
  Layers,
  Loader2,
  Mail,
  Phone,
  Receipt,
  Target,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USER_STATUSES } from "@/lib/validations/user";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/validations/payment";
import type { StudentProfile } from "@/server/services/student-profile-service";
import type { BatchSchedule } from "@/lib/validations/batch";
import { cn } from "@/lib/utils";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  INACTIVE: "bg-muted text-muted-foreground",
  SUSPENDED: "bg-destructive/10 text-destructive",
};

const DAY_LABEL: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** "Mon, Wed, Fri · 6:30 PM – 8:00 PM" — the client's "his timings". */
function scheduleLabel(schedule: BatchSchedule | null): string | null {
  if (!schedule) return null;
  const days = schedule.days.map((d) => DAY_LABEL[d] ?? d).join(", ");
  const hours =
    schedule.startTime && schedule.endTime
      ? `${clock(schedule.startTime)} – ${clock(schedule.endTime)}`
      : schedule.startTime
        ? clock(schedule.startTime)
        : "";
  return [days, hours].filter(Boolean).join(" · ") || null;
}

/** "18:30" → "6:30 PM". Wall-clock strings, so no Date and no timezone. */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tone ?? "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

export function StudentProfileView({ profile }: { profile: StudentProfile }) {
  const router = useRouter();
  const [status, setStatus] = useState(profile.status);
  const [saving, setSaving] = useState(false);
  const [internStart, setInternStart] = useState(profile.internshipStartAt?.slice(0, 10) ?? "");
  const [internEnd, setInternEnd] = useState(profile.internshipEndAt?.slice(0, 10) ?? "");
  const [savingIntern, setSavingIntern] = useState(false);

  const internDirty =
    internStart !== (profile.internshipStartAt?.slice(0, 10) ?? "") ||
    internEnd !== (profile.internshipEndAt?.slice(0, 10) ?? "");

  async function saveInternship() {
    setSavingIntern(true);
    try {
      await api.patch(`/api/admin/users/${profile.id}`, {
        internshipStartAt: internStart,
        internshipEndAt: internEnd,
      });
      toast.success("Internship dates saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the dates.");
    } finally {
      setSavingIntern(false);
    }
  }

  async function changeStatus(next: string) {
    const previous = status;
    setStatus(next);
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${profile.id}`, { status: next });
      toast.success(`Marked ${next.toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      setStatus(previous);
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the status.");
    } finally {
      setSaving(false);
    }
  }

  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const active = profile.enrollments.filter((e) => e.status === "ACTIVE").length;
  const completed = profile.enrollments.filter((e) => e.completedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.name}
        description={`${profile.role} · joined ${day(profile.createdAt)}`}
        actions={
          <Button variant="outline" render={<Link href="/admin/users" />} nativeButton={false}>
            Back to users
          </Button>
        }
      />

      {/* ── Identity ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center">
          <Avatar className="size-16 shrink-0">
            {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.name} />}
            <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-lg font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Email"
              value={
                <span className="flex items-center gap-1.5">
                  <Mail className="text-muted-foreground size-3.5 shrink-0" />
                  {profile.email}
                </span>
              }
            />
            <Field
              label="Phone"
              value={
                profile.phone ? (
                  <a
                    href={`tel:${profile.phone}`}
                    className="hover:text-primary flex items-center gap-1.5 transition-colors"
                  >
                    <Phone className="text-muted-foreground size-3.5 shrink-0" />
                    {profile.phone}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Date of joining" value={day(profile.joinedCourseAt)} />
            <Field
              label="Last signed in"
              value={profile.lastLoginAt ? day(profile.lastLoginAt) : "Never"}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className={STATUS_TONE[status]}>
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </Badge>
            <Select value={status} onValueChange={(v) => v && changeStatus(v)}>
              <SelectTrigger aria-label="Change status" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                {USER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {profile.lead && (
        <Link
          href="/admin/leads"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <Target className="size-4" />
          Came from enquiry {profile.lead.leadNo ?? profile.lead.id.slice(0, 8)}
          <ExternalLink className="size-3.5" />
        </Link>
      )}

      {/* ── The numbers ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Wallet}
          label="Fees paid"
          value={inr(profile.paidTotal)}
          hint={profile.pendingTotal > 0 ? `${inr(profile.pendingTotal)} pending` : undefined}
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
        />
        <Stat
          icon={CalendarClock}
          label="Attendance"
          value={profile.attendance.percent != null ? `${profile.attendance.percent}%` : "—"}
          hint={
            profile.attendance.held > 0
              ? `${profile.attendance.present} of ${profile.attendance.held} classes · ${profile.attendance.upcoming} to come`
              : "No classes held yet"
          }
        />
        <Stat
          icon={FileQuestion}
          label="Quizzes completed"
          value={String(profile.quizzes.completed)}
          hint={
            profile.quizzes.averagePercent != null
              ? `${profile.quizzes.averagePercent}% average`
              : undefined
          }
        />
        <Stat
          icon={ClipboardList}
          label="Assignments done"
          value={
            profile.assignments.assigned > 0
              ? `${profile.assignments.completed}/${profile.assignments.assigned}`
              : String(profile.assignments.completed)
          }
          hint={`${profile.assignments.graded} graded`}
        />
      </div>

      {/* ── Attendance breakdown ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" /> Classes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Field label="Classes held" value={String(profile.attendance.held)} />
          <Field label="Attended" value={String(profile.attendance.present)} />
          <Field label="Missed" value={String(profile.attendance.absent)} />
          <Field label="Pending (scheduled)" value={String(profile.attendance.upcoming)} />
          {profile.attendance.unmarked > 0 && (
            <p className="text-muted-foreground text-xs sm:col-span-4">
              {profile.attendance.unmarked} held{" "}
              {profile.attendance.unmarked === 1 ? "class has" : "classes have"} no
              register taken, so they don&apos;t count either way.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Internship ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="size-4" /> Internship
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="intern-start">Start date</Label>
            <Input
              id="intern-start"
              type="date"
              className="w-44"
              value={internStart}
              onChange={(e) => setInternStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intern-end">Completion date</Label>
            <Input
              id="intern-end"
              type="date"
              className="w-44"
              value={internEnd}
              onChange={(e) => setInternEnd(e.target.value)}
            />
          </div>
          <Button onClick={saveInternship} disabled={!internDirty || savingIntern}>
            {savingIntern && <Loader2 className="size-4 animate-spin" />}
            Save dates
          </Button>
          <p className="text-muted-foreground w-full text-xs">
            An internship certificate issued for this learner fills its own dates
            in from here, so they only have to be entered once.
          </p>
        </CardContent>
      </Card>

      {/* ── Courses, cohorts and certificates ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" /> Courses ({profile.enrollments.length})
            {active > 0 && (
              <Badge variant="secondary" className="ml-1 font-normal">
                {active} active
              </Badge>
            )}
            {completed > 0 && (
              <Badge variant="secondary" className="font-normal">
                {completed} completed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.enrollments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Not enrolled on anything yet.</p>
          ) : (
            profile.enrollments.map((e) => {
              const timings = scheduleLabel(e.batch?.schedule ?? null);
              return (
                <div key={e.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/courses/${e.courseSlug}`}
                        className="hover:text-primary font-medium transition-colors"
                      >
                        {e.courseTitle}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        Joined {day(e.enrolledAt)}
                        {e.completedAt ? ` · completed ${day(e.completedAt)}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>Progress</span>
                      <span className="tabular-nums">{Math.round(e.progressPercent)}%</span>
                    </div>
                    <Progress value={e.progressPercent} />
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label="Batch"
                      value={
                        e.batch ? (
                          <span className="flex items-center gap-1.5">
                            <Layers className="text-muted-foreground size-3.5 shrink-0" />
                            {e.batch.name}
                            <span className="text-muted-foreground font-mono text-xs">
                              {e.batch.code}
                            </span>
                          </span>
                        ) : (
                          "Not assigned"
                        )
                      }
                    />
                    <Field label="Timings" value={timings ?? "—"} />
                    <Field
                      label="Trainer"
                      value={
                        e.batch?.instructorName ? (
                          <span className="flex items-center gap-1.5">
                            <UserRound className="text-muted-foreground size-3.5 shrink-0" />
                            {e.batch.instructorName}
                          </span>
                        ) : (
                          "—"
                        )
                      }
                    />
                    {e.batch?.startDate && (
                      <Field
                        label="Batch runs"
                        value={`${day(e.batch.startDate)} → ${day(e.batch.endDate)}`}
                      />
                    )}
                    <Field
                      label="Certificate"
                      value={
                        e.certificate ? (
                          <Link
                            href={`/certificate/${e.certificate.verificationCode}`}
                            className="hover:text-primary flex items-center gap-1.5 transition-colors"
                          >
                            <Award className="size-3.5 shrink-0 text-amber-500" />
                            {e.certificate.status === "REVOKED"
                              ? "Revoked"
                              : `Issued ${day(e.certificate.issuedAt)}`}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not issued</span>
                        )
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Money ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" /> Payments ({profile.payments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payments recorded.</p>
          ) : (
            <ul className="divide-y">
              {profile.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {inr(p.netAmount)}
                      {p.courseTitle && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {p.courseTitle}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {p.invoiceNumber}
                      {p.method ? ` · ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}` : ""}
                      {" · "}
                      {day(p.paidAt ?? p.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      p.status === "PAID"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : p.status === "FAILED"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    }
                  >
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
