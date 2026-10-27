"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  CheckCircle2,
  FileText,
  GraduationCap,
  IdCard,
  Loader2,
  Lock,
  MapPin,
  Paperclip,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  GENDERS,
  ID_PROOF_TYPES,
  JOB_STATUSES,
  LOCKED_AFTER_SUBMIT,
  WORK_MODES,
} from "@/lib/validations/student-detail";
import type { StudentDetailView } from "@/server/services/student-detail-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
// (The four former dropdowns are now ChoiceChips; Select is no longer used.)
import { PhoneInput } from "@/components/shared/phone-input";
import { cn } from "@/lib/utils";

/**
 * The learner's onboarding form, and the office's copy of it.
 *
 * One component for both: `staff` decides where it saves and whether the
 * verified fields are editable. A learner can save it half-finished as often as
 * they like; submitting locks their documents and schooling, because that is
 * what admissions has checked against the originals.
 */

type Values = Record<string, string | boolean>;

const FIELD_KEYS = [
  "whatsapp",
  "alternatePhone",
  "addressLine",
  "city",
  "state",
  "pincode",
  "country",
  "gender",
  "fatherName",
  "guardianPhone",
  "aadhaarNumber",
  "aadhaarUrl",
  "idProofType",
  "idProofNumber",
  "idProofUrl",
  "highestQualification",
  "specialization",
  "collegeName",
  "passingYear",
  "marksPercent",
  "cvUrl",
  "cvName",
  "jobStatus",
  "currentCompany",
  "currentRole",
  "experienceYears",
  "currentPackage",
  "expectedPackage",
  "preferredLocations",
  "preferredMode",
] as const;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOC_BYTES = 25 * 1024 * 1024;

function initialValues(view: StudentDetailView): Values {
  const d = view.detail;
  const out: Values = {};
  for (const key of FIELD_KEYS) {
    const value = d ? (d as unknown as Record<string, unknown>)[key] : null;
    out[key] = value === null || value === undefined ? "" : String(value);
  }
  out.country = out.country || "India";
  out.willingToRelocate = d?.willingToRelocate ?? false;
  out.openToPlacement = d?.openToPlacement ?? true;
  return out;
}

function Field({
  label,
  children,
  hint,
  locked,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  locked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {locked && <Lock className="text-muted-foreground size-3" />}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

/** One uploaded document: choose, replace, or clear. */
function DocField({
  label,
  url,
  name,
  disabled,
  accept,
  onChange,
}: {
  label: string;
  url: string;
  name?: string;
  disabled?: boolean;
  accept: string;
  onChange: (url: string, fileName: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES)) {
      toast.error(isImage ? "Images must be under 5 MB." : "Files must be under 25 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", isImage ? "image" : "doc");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Upload failed.");
      }
      onChange(json.data.url as string, file.name);
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {disabled && <Lock className="text-muted-foreground size-3" />}
      </Label>
      {url ? (
        <div className="bg-muted/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
          <FileText className="size-4 shrink-0" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm hover:underline"
          >
            {name || "View the file"}
          </a>
          {!disabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => onChange("", "")}
              aria-label={`Remove ${label}`}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ) : disabled ? (
        <p className="text-muted-foreground text-sm">Not uploaded.</p>
      ) : (
        <label className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="text-muted-foreground size-4" />
          )}
          <span className="text-muted-foreground">
            {uploading ? "Uploading…" : "Choose a file — a clear photo or a PDF"}
          </span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}

/** A compact circular progress ring — white, for the gradient hero. */
function CompletionRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-white/25" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-white transition-[stroke-dashoffset] duration-500"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-sm font-semibold tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

/**
 * A row of selectable pills — one tap, every option visible, nicer on a phone
 * than a dropdown. Clicking the active pill again clears it. When `disabled`
 * (a field locked after submit) the pills are shown but can't be changed.
 */
function ChoiceChips({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? "" : o.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-foreground hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StudentDetailsClient({
  view,
  staff = false,
  userId,
}: {
  view: StudentDetailView;
  staff?: boolean;
  userId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => initialValues(view));
  const [state, setState] = useState(view);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  // A learner confirms the policy before the formal submit; the office doesn't.
  const [agreed, setAgreed] = useState(false);

  const endpoint = staff ? `/api/admin/students/${userId}/details` : "/api/student/details";

  // Only fields that actually held a value at submit lock — one left blank by a
  // premature submit stays editable, so a learner isn't shut out of it.
  const lockedKeys = useMemo(() => {
    const d = view.detail as Record<string, unknown> | null;
    return new Set(
      (LOCKED_AFTER_SUBMIT as readonly string[]).filter((k) => {
        const v = d?.[k];
        return v != null && String(v).trim() !== "";
      }),
    );
  }, [view.detail]);
  const locked = (key: string) => !staff && state.submitted && lockedKeys.has(key);

  // The office re-opens a submitted profile for the learner to edit again.
  async function unlock() {
    setUnlocking(true);
    try {
      const res = await api.post<StudentDetailView & { message: string }>(
        `/api/admin/students/${userId}/details/unlock`,
      );
      setState(res);
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't unlock that.");
    } finally {
      setUnlocking(false);
    }
  }

  const set = (key: string) => (value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function save(submit: boolean) {
    setSaving(submit ? "submit" : "draft");
    try {
      const res = await api.patch<StudentDetailView & { message: string }>(endpoint, {
        ...values,
        submit,
      });
      setState(res);
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that just now.");
    } finally {
      setSaving(null);
    }
  }

  const text = (key: string, placeholder?: string) => (
    <Input
      value={String(values[key] ?? "")}
      placeholder={placeholder}
      disabled={locked(key)}
      onChange={(e) => set(key)(e.target.value)}
    />
  );

  const phone = (key: string, placeholder?: string) => (
    <PhoneInput
      value={String(values[key] ?? "")}
      onChange={(v) => set(key)(v)}
      placeholder={placeholder}
    />
  );

  const chips = (
    key: string,
    options: readonly { value: string; label: string }[],
  ) => (
    <ChoiceChips
      value={String(values[key] ?? "")}
      options={options}
      disabled={locked(key)}
      onChange={(v) => set(key)(v)}
    />
  );

  // ── The four sections, defined once so either layout can arrange them. ──────
  const contactSection = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="text-primary size-4.5" /> Where you are, and how to reach you
        </CardTitle>
        <CardDescription>
          Class links and certificates go to your email; the office calls the numbers here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp number">{phone("whatsapp")}</Field>
        <Field label="Another number">{phone("alternatePhone")}</Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <Textarea
              rows={3}
              value={String(values.addressLine ?? "")}
              placeholder="House, street, area"
              onChange={(e) => set("addressLine")(e.target.value)}
            />
          </Field>
        </div>
        <Field label="City">{text("city")}</Field>
        <Field label="State">{text("state")}</Field>
        <Field label="PIN code">{text("pincode")}</Field>
        <Field label="Country">{text("country")}</Field>
      </CardContent>
    </Card>
  );

  const identitySection = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="text-primary size-4.5" /> Identity and documents
        </CardTitle>
        <CardDescription>
          A photo of each is fine, as long as the details are readable.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Gender">{chips("gender", GENDERS)}</Field>
        </div>
        <Field label="Father's name" locked={locked("fatherName")}>
          {text("fatherName")}
        </Field>
        <Field label="Parent or guardian's number">{phone("guardianPhone")}</Field>
        <Field label="Aadhaar number" locked={locked("aadhaarNumber")}>
          {text("aadhaarNumber", "12 digits")}
        </Field>
        <DocField
          label="Aadhaar copy"
          url={String(values.aadhaarUrl ?? "")}
          name={String(values.aadhaarUrl ?? "") ? "Aadhaar on file" : ""}
          disabled={locked("aadhaarUrl")}
          accept="image/*,application/pdf"
          onChange={(url) => set("aadhaarUrl")(url)}
        />
        <div className="space-y-4 sm:col-span-2">
          <Field label="Other photo ID" locked={locked("idProofType")}>
            {chips("idProofType", ID_PROOF_TYPES)}
          </Field>
          <div className="sm:max-w-xs">
            <Field label="Its number" locked={locked("idProofNumber")}>
              {text("idProofNumber")}
            </Field>
          </div>
        </div>
        <DocField
          label="Photo ID copy"
          url={String(values.idProofUrl ?? "")}
          name={String(values.idProofUrl ?? "") ? "ID on file" : ""}
          disabled={locked("idProofUrl")}
          accept="image/*,application/pdf"
          onChange={(url) => set("idProofUrl")(url)}
        />
      </CardContent>
    </Card>
  );

  const educationSection = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="text-primary size-4.5" /> What you&apos;ve studied
        </CardTitle>
        <CardDescription>Your most recent qualification is enough.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Highest qualification" locked={locked("highestQualification")}>
          {text("highestQualification", "B.Sc, B.Pharm, BAMS…")}
        </Field>
        <Field label="Stream or specialisation">{text("specialization")}</Field>
        <Field label="College or school" locked={locked("collegeName")}>
          {text("collegeName")}
        </Field>
        <Field label="Year of passing" locked={locked("passingYear")}>
          {text("passingYear", "2024")}
        </Field>
        <Field label="Marks or CGPA" locked={locked("marksPercent")}>
          {text("marksPercent", "72% or 7.2")}
        </Field>
        <DocField
          label="Your CV"
          url={String(values.cvUrl ?? "")}
          name={String(values.cvName ?? "")}
          accept=".pdf,.doc,.docx,application/pdf"
          onChange={(url, fileName) => {
            set("cvUrl")(url);
            set("cvName")(fileName);
          }}
        />
      </CardContent>
    </Card>
  );

  const workSection = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="text-primary size-4.5" /> Work, and what you want next
        </CardTitle>
        <CardDescription>
          The placement team reads this before it puts your name forward.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Where you are now">{chips("jobStatus", JOB_STATUSES)}</Field>
        </div>
        <Field label="Years of experience">{text("experienceYears", "0, 1.5, 3…")}</Field>
        <Field label="Current company">{text("currentCompany")}</Field>
        <Field label="Current role">{text("currentRole")}</Field>
        <Field label="Current package (₹ per year)">{text("currentPackage")}</Field>
        <Field label="Expected package (₹ per year)">{text("expectedPackage")}</Field>
        <Field label="Preferred locations" hint="Separate them with commas.">
          {text("preferredLocations", "Dehradun, Delhi, Remote")}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Preferred way of working">
            {chips("preferredMode", WORK_MODES)}
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Willing to relocate</p>
            <p className="text-muted-foreground text-xs">For the right role.</p>
          </div>
          <Switch
            checked={Boolean(values.willingToRelocate)}
            onCheckedChange={(v) => set("willingToRelocate")(Boolean(v))}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Open to placement</p>
            <p className="text-muted-foreground text-xs">
              Put my name forward for openings.
            </p>
          </div>
          <Switch
            checked={Boolean(values.openToPlacement)}
            onCheckedChange={(v) => set("openToPlacement")(Boolean(v))}
          />
        </div>
      </CardContent>
    </Card>
  );

  // A richer header for the learner — a progress ring, status, and the
  // still-missing items as chips, on the brand gradient.
  const heroHeader = (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 via-fuchsia-700 to-violet-800 p-5 text-white sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 size-56 rounded-full bg-black/10 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <CompletionRing value={state.completion} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold sm:text-xl">Your admission profile</h2>
            {state.completion === 100 && (
              <Badge className="gap-1 border-0 bg-white/20 text-[10px] text-white">
                <CheckCircle2 className="size-3" /> Complete
              </Badge>
            )}
            {state.submitted && (
              <Badge className="border-0 bg-white/20 text-[10px] text-white">
                Submitted
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-white/85">
            {state.missing.length === 0
              ? "Everything the academy needs is on file."
              : `${state.missing.length} detail${state.missing.length === 1 ? "" : "s"} still needed — fill in the form below.`}
          </p>
          {state.missing.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {state.missing.slice(0, 8).map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs text-white/90"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {staff ? (
        /* How far through they are — the same figure the office sees. */
        <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Profile completion
                {state.completion === 100 && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="size-3" /> Complete
                  </Badge>
                )}
                {state.submitted && (
                  <Badge variant="secondary" className="text-[10px]">
                    Submitted
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {state.missing.length === 0
                  ? "Everything the academy needs is on file."
                  : `Still needed: ${state.missing.join(", ")}.`}
              </CardDescription>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{state.completion}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={state.completion} />
        </CardContent>
        </Card>
      ) : (
        heroHeader
      )}

      {staff && state.submitted && (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <p className="text-muted-foreground flex items-center gap-2">
            <Lock className="size-4 shrink-0" />
            This profile is submitted. Unlock it to let the learner edit it again.
          </p>
          <Button variant="outline" size="sm" onClick={unlock} disabled={unlocking}>
            {unlocking ? <Loader2 className="size-4 animate-spin" /> : <Unlock className="size-4" />}
            Unlock for the learner
          </Button>
        </div>
      )}

      {state.submitted && !staff && (
        <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            Your documents and schooling are locked now that they&apos;ve been checked. Write
            to the office if any of it needs correcting — they can change it for you.
          </p>
        </div>
      )}

      {contactSection}
      {identitySection}
      {educationSection}
      {workSection}

      {/* Consent, then the actions. The learner agrees to the policy before the
          formal submit; "Save for later" keeps a draft and needs no agreement. */}
      <div
        className={
          staff ? "space-y-4" : "bg-card space-y-4 rounded-2xl border p-4 sm:p-5"
        }
      >
        {!staff && !state.submitted && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3.5">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(Boolean(v))}
              className="mt-0.5"
            />
            <span className="text-muted-foreground text-sm">
              I confirm the details above are correct, and I agree to the{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium underline underline-offset-4"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium underline underline-offset-4"
              >
                Terms of Service
              </Link>
              .
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={saving !== null} onClick={() => void save(false)}>
            {saving === "draft" && <Loader2 className="size-4 animate-spin" />}
            {staff ? "Save changes" : "Save for later"}
          </Button>
          {!staff && !state.submitted && (
            <Button
              disabled={saving !== null || !agreed}
              onClick={() => void save(true)}
            >
              {saving === "submit" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              Submit my details
            </Button>
          )}
          {!staff && (
            <p className="text-muted-foreground text-xs">
              {state.submitted
                ? "Submitted. Anything not locked can still be updated."
                : "Saving keeps a draft; submitting sends it to the office."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
