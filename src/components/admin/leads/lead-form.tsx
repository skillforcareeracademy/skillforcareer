"use client";

import type { ReactNode } from "react";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_CLASS_MODES,
  LEAD_CLASS_MODE_LABELS,
  LEAD_QUALITIES,
  LEAD_QUALITY_LABELS,
  LEAD_SUB_STATUSES,
  type LeadStage,
  type LeadSource,
  type LeadClassMode,
  type LeadQuality,
} from "@/lib/validations/lead";
import { PhoneInput } from "@/components/shared/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Every field on the client's counselling sheet, in their order, shared by the
 * "Add lead" dialog and the edit tab of the detail sheet so the two can never
 * drift apart.
 */
export interface LeadFormState {
  leadDate: string;
  source: LeadSource;
  quality: string;
  leadScore: string;
  name: string;
  phone: string;
  email: string;
  courseId: string;
  courseInterest: string;
  whyThisCourse: string;
  stage: LeadStage;
  subStatus: string;
  qualification: string;
  jobStatus: string;
  experiencedIn: string;
  address: string;
  classMode: string;
  expectedVisit: string;
  visitDate: string;
  visitTime: string;
  followUpDate: string;
  followUpTime: string;
  message: string;
  feesOffered: string;
  finalFees: string;
  emiCount: string;
  assignedToId: string;
}

export const NONE = "none";
/** Free text rather than one of our course rows. */
export const OTHER_COURSE = "other";

const today = () => new Date().toISOString().slice(0, 10);

export function blankLeadForm(): LeadFormState {
  return {
    leadDate: today(),
    source: "MANUAL",
    quality: "",
    leadScore: "",
    name: "",
    phone: "",
    email: "",
    courseId: "",
    courseInterest: "",
    whyThisCourse: "",
    stage: "FRESH_LEAD",
    subStatus: "",
    qualification: "",
    jobStatus: "",
    experiencedIn: "",
    address: "",
    classMode: "",
    expectedVisit: "",
    visitDate: "",
    visitTime: "",
    followUpDate: "",
    followUpTime: "",
    message: "",
    feesOffered: "",
    finalFees: "",
    emiCount: "",
    assignedToId: "",
  };
}

/** Only the fields the API accepts, with "" collapsed to undefined. */
export function leadFormPayload(form: LeadFormState): Record<string, unknown> {
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    leadDate: text(form.leadDate),
    source: form.source,
    quality: form.quality || undefined,
    leadScore: text(form.leadScore),
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: text(form.email),
    courseId: text(form.courseId),
    courseInterest: text(form.courseInterest),
    whyThisCourse: text(form.whyThisCourse),
    stage: form.stage,
    subStatus: text(form.subStatus),
    classMode: form.classMode || undefined,
    qualification: text(form.qualification),
    jobStatus: text(form.jobStatus),
    experiencedIn: text(form.experiencedIn),
    address: text(form.address),
    expectedVisit: text(form.expectedVisit),
    visitDate: text(form.visitDate),
    visitTime: text(form.visitTime),
    followUpDate: text(form.followUpDate),
    followUpTime: text(form.followUpTime),
    message: text(form.message),
    feesOffered: text(form.feesOffered),
    finalFees: text(form.finalFees),
    emiCount: text(form.emiCount),
    assignedToId: form.assignedToId || "",
  };
}

export interface CourseOption {
  id: string;
  title: string;
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground col-span-full mt-1 text-xs font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

export function LeadFormFields({
  form,
  onChange,
  courses,
  assignees,
  disabled,
}: {
  form: LeadFormState;
  onChange: (patch: Partial<LeadFormState>) => void;
  courses: CourseOption[];
  assignees: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const subStatuses = LEAD_SUB_STATUSES[form.stage] ?? [];
  // A sub-status carried over from an earlier stage stays selectable until the
  // counsellor picks a new one — dropping it silently would lose information.
  const subStatusOptions =
    form.subStatus && !subStatuses.includes(form.subStatus)
      ? [form.subStatus, ...subStatuses]
      : subStatuses;

  const courseValue =
    form.courseId || (form.courseInterest ? OTHER_COURSE : "");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Lead date" htmlFor="l-date">
        <Input
          id="l-date"
          type="date"
          value={form.leadDate}
          disabled={disabled}
          onChange={(e) => onChange({ leadDate: e.target.value })}
        />
      </Field>
      <Field label="Lead source">
        <Select
          value={form.source}
          onValueChange={(v) =>
            onChange({ source: (v as LeadSource) ?? "MANUAL" })
          }
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) => LEAD_SOURCE_LABELS[(v as LeadSource) ?? "MANUAL"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LEAD_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* The client asked for quality and score to sit directly under source. */}
      <Field label="Lead quality">
        <Select
          value={form.quality || NONE}
          onValueChange={(v) =>
            onChange({ quality: !v || v === NONE ? "" : v })
          }
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) =>
                !v || v === NONE
                  ? "Not rated"
                  : LEAD_QUALITY_LABELS[v as LeadQuality]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not rated</SelectItem>
            {LEAD_QUALITIES.map((q) => (
              <SelectItem key={q} value={q}>
                {LEAD_QUALITY_LABELS[q]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Lead score"
        htmlFor="l-score"
        hint="0–100 — how strong this lead looks."
      >
        <Input
          id="l-score"
          inputMode="numeric"
          value={form.leadScore}
          placeholder="e.g. 80"
          disabled={disabled}
          onChange={(e) => onChange({ leadScore: e.target.value })}
        />
      </Field>

      <Field label="Name" htmlFor="l-name" required>
        <Input
          id="l-name"
          value={form.name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="Number" required>
        <PhoneInput
          value={form.phone}
          onChange={(v) => onChange({ phone: v })}
        />
      </Field>

      <Field label="Email" htmlFor="l-email">
        <Input
          id="l-email"
          type="email"
          value={form.email}
          disabled={disabled}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <Field label="Course">
        <Select
          value={courseValue || NONE}
          onValueChange={(v) => {
            if (!v || v === NONE)
              onChange({ courseId: "", courseInterest: "" });
            else if (v === OTHER_COURSE) onChange({ courseId: "" });
            else onChange({ courseId: v, courseInterest: "" });
          }}
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) =>
                !v || v === NONE
                  ? "Select a course"
                  : v === OTHER_COURSE
                    ? form.courseInterest || "Other"
                    : (courses.find((c) => c.id === v)?.title ??
                      "Select a course")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not decided yet</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_COURSE}>Other (type below)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {courseValue === OTHER_COURSE && (
        <Field label="Course (other)" htmlFor="l-course-other">
          <Input
            id="l-course-other"
            value={form.courseInterest}
            placeholder="e.g. Data Analytics"
            disabled={disabled}
            onChange={(e) => onChange({ courseInterest: e.target.value })}
          />
        </Field>
      )}

      <div className="sm:col-span-2">
        <Field label="Why this course" htmlFor="l-why">
          <Textarea
            id="l-why"
            rows={2}
            value={form.whyThisCourse}
            placeholder="What they told the counsellor"
            disabled={disabled}
            onChange={(e) => onChange({ whyThisCourse: e.target.value })}
          />
        </Field>
      </div>

      <SectionTitle>Funnel</SectionTitle>
      <Field label="Stage">
        <Select
          value={form.stage}
          onValueChange={(v) => {
            const stage = (v as LeadStage) ?? "FRESH_LEAD";
            // The sub-status list belongs to the stage — reset it on a change.
            onChange({ stage, subStatus: "" });
          }}
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) => LEAD_STAGE_LABELS[(v as LeadStage) ?? "FRESH_LEAD"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LEAD_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Status">
        <Select
          value={form.subStatus || NONE}
          onValueChange={(v) =>
            onChange({ subStatus: !v || v === NONE ? "" : v })
          }
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) => (!v || v === NONE ? "No status" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No status</SelectItem>
            {subStatusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Class mode">
        <Select
          value={form.classMode || NONE}
          onValueChange={(v) =>
            onChange({ classMode: !v || v === NONE ? "" : v })
          }
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) =>
                !v || v === NONE
                  ? "Not decided"
                  : LEAD_CLASS_MODE_LABELS[v as LeadClassMode]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not decided</SelectItem>
            {LEAD_CLASS_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {LEAD_CLASS_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Assigned to">
        <Select
          value={form.assignedToId || NONE}
          onValueChange={(v) =>
            onChange({ assignedToId: !v || v === NONE ? "" : v })
          }
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue>
              {(v) =>
                !v || v === NONE
                  ? "Unassigned"
                  : (assignees.find((a) => a.id === v)?.name ?? "Unassigned")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <SectionTitle>Background</SectionTitle>
      <Field label="Qualification" htmlFor="l-qual">
        <Input
          id="l-qual"
          value={form.qualification}
          placeholder="e.g. B.Tech, 2024"
          disabled={disabled}
          onChange={(e) => onChange({ qualification: e.target.value })}
        />
      </Field>
      <Field label="Job status" htmlFor="l-job">
        <Input
          id="l-job"
          value={form.jobStatus}
          placeholder="e.g. Fresher / Working"
          disabled={disabled}
          onChange={(e) => onChange({ jobStatus: e.target.value })}
        />
      </Field>
      <Field label="Experienced in" htmlFor="l-exp">
        <Input
          id="l-exp"
          value={form.experiencedIn}
          placeholder="e.g. 1 yr support engineer"
          disabled={disabled}
          onChange={(e) => onChange({ experiencedIn: e.target.value })}
        />
      </Field>
      <Field label="Address" htmlFor="l-addr">
        <Input
          id="l-addr"
          value={form.address}
          placeholder="City / area"
          disabled={disabled}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>

      <SectionTitle>Centre visit</SectionTitle>
      <div className="sm:col-span-2">
        <Field
          label="Expected visit"
          htmlFor="l-visit"
          required
          hint="In their words — “this Saturday”, “after results”, “next month”."
        >
          <Input
            id="l-visit"
            value={form.expectedVisit}
            disabled={disabled}
            onChange={(e) => onChange({ expectedVisit: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Visit date" htmlFor="l-visit-date">
        <Input
          id="l-visit-date"
          type="date"
          value={form.visitDate}
          disabled={disabled}
          onChange={(e) => onChange({ visitDate: e.target.value })}
        />
      </Field>
      <Field
        label="Visit time"
        htmlFor="l-visit-time"
        hint="24-hour, e.g. 16:30"
      >
        <Input
          id="l-visit-time"
          type="time"
          value={form.visitTime}
          disabled={disabled}
          onChange={(e) => onChange({ visitTime: e.target.value })}
        />
      </Field>

      <SectionTitle>Next follow-up</SectionTitle>
      <Field
        label="Follow-up date"
        htmlFor="l-fu-date"
        hint="A reminder goes out the day before."
      >
        <Input
          id="l-fu-date"
          type="date"
          value={form.followUpDate}
          disabled={disabled}
          onChange={(e) => onChange({ followUpDate: e.target.value })}
        />
      </Field>
      <Field label="Follow-up time" htmlFor="l-fu-time">
        <Input
          id="l-fu-time"
          type="time"
          value={form.followUpTime}
          disabled={disabled}
          onChange={(e) => onChange({ followUpTime: e.target.value })}
        />
      </Field>

      <SectionTitle>Fees</SectionTitle>
      <Field label="Fees offered (₹)" htmlFor="l-fees" required>
        <Input
          id="l-fees"
          inputMode="numeric"
          value={form.feesOffered}
          placeholder="35000"
          disabled={disabled}
          onChange={(e) => onChange({ feesOffered: e.target.value })}
        />
      </Field>
      <Field label="Final fees (₹)" htmlFor="l-final">
        <Input
          id="l-final"
          inputMode="numeric"
          value={form.finalFees}
          placeholder="Once negotiated"
          disabled={disabled}
          onChange={(e) => onChange({ finalFees: e.target.value })}
        />
      </Field>
      <Field label="No. of EMI" htmlFor="l-emi">
        <Input
          id="l-emi"
          inputMode="numeric"
          value={form.emiCount}
          placeholder="e.g. 3"
          disabled={disabled}
          onChange={(e) => onChange({ emiCount: e.target.value })}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Notes" htmlFor="l-notes">
          <Textarea
            id="l-notes"
            rows={2}
            value={form.message}
            disabled={disabled}
            onChange={(e) => onChange({ message: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
