"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Send,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CV_ACCEPT,
  CV_MAX_BYTES,
  CV_MAX_LABEL,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_MODES,
  JOB_MODE_LABELS,
  OTHER_COURSE,
  jobApplicationSchema,
  type ExperienceLevel,
  type JobMode,
} from "@/lib/validations/careers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/shared/phone-input";

interface CourseOption {
  id: string;
  title: string;
}

interface Prefill {
  name: string;
  email: string;
  phone: string;
  enrolments: { courseId: string; courseTitle: string; batchCode: string | null }[];
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  courseId: string;
  courseName: string;
  batchCode: string;
  jobExpecting: string;
  experienceLevel: ExperienceLevel | "";
  experienceDetails: string;
  currentAddress: string;
  expectedLocation: string;
  expectedMode: JobMode | "";
  joiningAvailability: string;
}

type Errors = Partial<Record<keyof FormState | "cv" | "consent", string>>;

const JOINING_SUGGESTIONS = [
  "Immediately",
  "Within 15 days",
  "Within 30 days",
  "After 60 days",
  "After my course ends",
];

const CV_EXTENSIONS = /\.(pdf|docx?)$/i;

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Send your CV" — the careers page's application form.
 *
 * The client's list, field for field: student details, course, batch number
 * (as printed on the certificate), the job they want, fresher or experienced
 * and the experience if any, current address, preferred location and mode, and
 * when they can join — with the CV itself. Everything lands in Admin → Careers
 * instead of an inbox.
 */
export function CareerApplicationForm({
  courses,
  role,
  post,
}: {
  courses: CourseOption[];
  /** Pre-fills "job expecting" when the visitor came from a team or role card. */
  role?: string;
  /** Set when applying to a specific open role with a hiring partner. */
  post?: { id: string; title: string; company: string; level: ExperienceLevel } | null;
}) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    courseId: "",
    courseName: "",
    batchCode: "",
    jobExpecting: post?.title ?? role ?? "",
    experienceLevel: post?.level ?? "",
    experienceDetails: "",
    currentAddress: "",
    expectedLocation: "",
    expectedMode: "",
    joiningAvailability: "",
  });
  const [cv, setCv] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ email: string } | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // PhoneInput seeds itself from its first value only, so a prefilled number
  // arriving after mount needs a fresh instance to show up.
  const [phoneKey, setPhoneKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/careers/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data as Prefill | null | undefined;
        if (!alive || !data) return;
        setPrefill(data);
        const first = data.enrolments[0];
        // Only fill what the visitor hasn't already started typing.
        setForm((f) => ({
          ...f,
          name: f.name || data.name,
          email: f.email || data.email,
          phone: f.phone || data.phone,
          courseId: f.courseId || first?.courseId || "",
          batchCode: f.batchCode || first?.batchCode || "",
        }));
        if (data.phone) setPhoneKey((k) => k + 1);
      })
      .catch(() => {
        // Not signed in, or offline — a blank form is fine.
      });
    return () => {
      alive = false;
    };
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // The learner's own courses first, then the catalogue — without repeats.
  const enrolled = prefill?.enrolments ?? [];
  const courseOptions: CourseOption[] = [
    ...enrolled.map((e) => ({ id: e.courseId, title: e.courseTitle })),
    ...courses.filter((c) => !enrolled.some((e) => e.courseId === c.id)),
  ];
  const courseTitle = (id: string) =>
    id === OTHER_COURSE
      ? "Other / not listed"
      : (courseOptions.find((c) => c.id === id)?.title ?? "Select your course");

  function pickCourse(id: string) {
    const previous = enrolled.find((e) => e.courseId === form.courseId)?.batchCode ?? "";
    const next = enrolled.find((e) => e.courseId === id)?.batchCode ?? "";
    setForm((f) => ({
      ...f,
      courseId: id,
      // Swap the batch along with the course, unless the visitor typed their own.
      batchCode: !f.batchCode || f.batchCode === previous ? next : f.batchCode,
    }));
    if (errors.courseId) setErrors((e) => ({ ...e, courseId: undefined }));
  }

  function pickFile(file: File | null) {
    if (!file) return;
    if (!CV_EXTENSIONS.test(file.name)) {
      setErrors((e) => ({ ...e, cv: "Upload a PDF or Word document (.pdf, .doc, .docx)." }));
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setErrors((e) => ({ ...e, cv: `Your CV must be under ${CV_MAX_LABEL}.` }));
      return;
    }
    setCv(file);
    setErrors((e) => ({ ...e, cv: undefined }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const parsed = jobApplicationSchema.safeParse({
      ...form,
      hiringPostId: post?.id ?? "",
      consent,
    });
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) next[key] = issue.message;
      }
    }
    // Zod runs its cross-field check only once every field passes, so repeat it
    // here to show this error alongside the rest rather than on a second try.
    if (
      form.experienceLevel === "EXPERIENCED" &&
      !form.experienceDetails.trim() &&
      !next.experienceDetails
    ) {
      next.experienceDetails = "Tell us about your experience — company, role and years";
    }
    if (!cv) next.cv = "Attach your CV (PDF or Word).";
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next);
      toast.error("Please check the highlighted fields.");
      // Bring the first problem into view — on a phone it may be a long way up.
      requestAnimationFrame(() => {
        document
          .querySelector("[data-invalid='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    const fd = new FormData();
    for (const [key, value] of Object.entries(form)) fd.append(key, value);
    if (post) fd.append("hiringPostId", post.id);
    fd.append("consent", "true");
    fd.append("website", honeypot);
    fd.append("cv", cv!);

    setSubmitting(true);
    try {
      const res = await fetch("/api/careers/applications", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (res.status === 413) {
          throw new Error(`Your CV is too large — keep it under ${CV_MAX_LABEL}.`);
        }
        const issues = json?.error?.details?.issues as
          | { path: string; message: string }[]
          | undefined;
        if (issues?.length) {
          setErrors(
            Object.fromEntries(issues.map((i) => [i.path.split(".")[0], i.message])),
          );
        }
        throw new Error(json?.error?.message ?? "Couldn't send your CV. Please try again.");
      }
      setDone({ email: form.email });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your CV. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-card flex flex-col items-center rounded-2xl border px-6 py-14 text-center shadow-sm">
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
        </span>
        <h2 className="text-2xl font-semibold">Your CV is with us</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Our placement team has your details. We&apos;ve sent a confirmation to{" "}
          <span className="text-foreground font-medium">{done.email}</span>, and
          we&apos;ll be in touch when a role matches what you&apos;re looking for.
        </p>
        <Button className="mt-6" variant="outline" nativeButton={false} render={<Link href="/careers" />}>
          <ArrowLeft className="size-4" /> Back to careers
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {prefill && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            Signed in as <span className="font-medium">{prefill.name}</span> — we&apos;ve
            filled in your details{enrolled.length ? ", course and batch" : ""} from your
            account. Check them before you send.
          </p>
        </div>
      )}

      {/* Honeypot: invisible to people, irresistible to form-filling scripts. */}
      <div aria-hidden className="absolute -left-[10000px] size-px overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <Section icon={UserRound} title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ca-name" label="Full name" error={errors.name}>
            <Input
              id="ca-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="As on your certificate"
              autoComplete="name"
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field id="ca-email" label="Email" error={errors.email}>
            <Input
              id="ca-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field label="Phone number" error={errors.phone}>
            <PhoneInput key={phoneKey} value={form.phone} onChange={(v) => set("phone", v)} />
          </Field>
          <Field id="ca-address" label="Current address" error={errors.currentAddress}>
            <Input
              id="ca-address"
              value={form.currentAddress}
              onChange={(e) => set("currentAddress", e.target.value)}
              placeholder="House / area, city, state"
              autoComplete="street-address"
              aria-invalid={!!errors.currentAddress}
            />
          </Field>
        </div>
      </Section>

      <Section icon={GraduationCap} title="Your training">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" error={errors.courseId}>
            <Select value={form.courseId || null} onValueChange={(v) => pickCourse(String(v ?? ""))}>
              <SelectTrigger className="w-full" aria-invalid={!!errors.courseId}>
                <SelectValue>
                  {(v) => (v ? courseTitle(String(v)) : "Select your course")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {courseOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_COURSE}>Other / not listed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="ca-batch"
            label="Batch number"
            hint="As printed on your certificate"
            optional
            error={errors.batchCode}
          >
            <Input
              id="ca-batch"
              value={form.batchCode}
              onChange={(e) => set("batchCode", e.target.value)}
              placeholder="e.g. SFC01"
            />
          </Field>
          {form.courseId === OTHER_COURSE && (
            <Field
              id="ca-course-name"
              label="Your course or qualification"
              optional
              error={errors.courseName}
              className="sm:col-span-2"
            >
              <Input
                id="ca-course-name"
                value={form.courseName}
                onChange={(e) => set("courseName", e.target.value)}
                placeholder="e.g. B.Com, or a course from another institute"
              />
            </Field>
          )}
        </div>
      </Section>

      <Section icon={Briefcase} title="The job you want">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="ca-job"
            label="Job you're looking for"
            error={errors.jobExpecting}
            className="sm:col-span-2"
          >
            <Input
              id="ca-job"
              value={form.jobExpecting}
              onChange={(e) => set("jobExpecting", e.target.value)}
              placeholder="e.g. Medical Coder, Data Analyst, Web Developer"
              aria-invalid={!!errors.jobExpecting}
            />
          </Field>

          <Field label="Fresher or experienced?" error={errors.experienceLevel} className="sm:col-span-2">
            <div role="radiogroup" className="grid grid-cols-2 gap-3">
              {EXPERIENCE_LEVELS.map((level) => {
                const active = form.experienceLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("experienceLevel", level)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/5 ring-primary/30 ring-2"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span className="block font-medium">{EXPERIENCE_LEVEL_LABELS[level]}</span>
                    <span className="text-muted-foreground block text-xs">
                      {level === "FRESHER"
                        ? "Looking for my first job"
                        : "I've worked before"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {form.experienceLevel === "EXPERIENCED" && (
            <Field
              id="ca-exp"
              label="Your experience"
              hint="Companies, roles and how long — the recent ones are enough"
              error={errors.experienceDetails}
              className="sm:col-span-2"
            >
              <Textarea
                id="ca-exp"
                rows={3}
                value={form.experienceDetails}
                onChange={(e) => set("experienceDetails", e.target.value)}
                placeholder="e.g. 2 years as a billing executive at ABC Hospital, Faridabad"
                aria-invalid={!!errors.experienceDetails}
              />
            </Field>
          )}

          <Field id="ca-location" label="Preferred job location" error={errors.expectedLocation}>
            <Input
              id="ca-location"
              value={form.expectedLocation}
              onChange={(e) => set("expectedLocation", e.target.value)}
              placeholder="e.g. Delhi NCR, Noida, anywhere"
              aria-invalid={!!errors.expectedLocation}
            />
          </Field>
          <Field label="Preferred job mode" error={errors.expectedMode}>
            <Select
              value={form.expectedMode || null}
              onValueChange={(v) => set("expectedMode", (v ?? "") as JobMode | "")}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.expectedMode}>
                <SelectValue>
                  {(v) => (v ? JOB_MODE_LABELS[v as JobMode] : "Select a mode")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {JOB_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {JOB_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="ca-join"
            label="When can you join?"
            error={errors.joiningAvailability}
            className="sm:col-span-2"
          >
            <Input
              id="ca-join"
              list="ca-join-options"
              value={form.joiningAvailability}
              onChange={(e) => set("joiningAvailability", e.target.value)}
              placeholder="e.g. Immediately, within 30 days, from 1 Nov"
              aria-invalid={!!errors.joiningAvailability}
            />
            <datalist id="ca-join-options">
              {JOINING_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>
      </Section>

      <Section icon={FileText} title="Your CV">
        <Field label="Upload your CV" error={errors.cv}>
          {cv ? (
            <div className="flex items-center gap-3 rounded-xl border p-3">
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{cv.name}</p>
                <p className="text-muted-foreground text-xs">{fileSize(cv.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove CV"
                onClick={() => {
                  setCv(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <label
              htmlFor="ca-cv"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "hover:bg-muted/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                errors.cv && "border-destructive/60",
              )}
            >
              <Upload className="text-muted-foreground size-6" />
              <span className="text-sm font-medium">Choose a file or drop it here</span>
              <span className="text-muted-foreground text-xs">
                PDF or Word (.pdf, .doc, .docx), up to {CV_MAX_LABEL}
              </span>
            </label>
          )}
          <input
            ref={fileRef}
            id="ca-cv"
            type="file"
            accept={CV_ACCEPT}
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      </Section>

      <div data-invalid={errors.consent ? "true" : undefined} className="space-y-1.5">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(checked) => {
              setConsent(checked === true);
              if (errors.consent) setErrors((e) => ({ ...e, consent: undefined }));
            }}
            aria-invalid={!!errors.consent}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            I agree that Skill For Career may keep my details and CV, and share them with
            its placement and hiring partners for job opportunities. See our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {errors.consent && <p className="text-destructive text-xs">{errors.consent}</p>}
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send className="size-4" /> Send my CV
          </>
        )}
      </Button>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  hint,
  optional,
  error,
  className,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-invalid={error ? "true" : undefined} className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
        {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
