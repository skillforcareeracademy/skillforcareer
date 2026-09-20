"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { addDays, format } from "date-fns";
import { Check, Loader2, Pencil } from "lucide-react";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
  LEAD_SUB_STATUSES,
  LEAD_QUALITIES,
  LEAD_QUALITY_LABELS,
  LEAD_CLASS_MODES,
  LEAD_CLASS_MODE_LABELS,
  parseAmount,
  type LeadStage,
} from "@/lib/validations/lead";
import {
  STAGE_BADGE,
  SUB_STATUS_BADGE,
  QUALITY_BADGE,
  CLASS_MODE_LABEL,
} from "@/components/admin/leads/lead-badges";
import {
  AssigneeLabel,
  assigneeOptions,
  type AssigneeOption,
} from "@/components/admin/leads/lead-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Click-to-edit cells for the lead table, so a sales agent can work the list
 * without opening every lead: stage / status, quality and score, class mode,
 * visit, next follow-up, fees and assignee. Single choices save the moment
 * they're picked; the few multi-field ones (visit, follow-up, fees, score)
 * save on Enter or the Save button. All go through the lead PATCH endpoint.
 */

/** The row fields these editors read and write. */
export interface InlineLead {
  id: string;
  name: string;
  stage: string;
  subStatus: string | null;
  quality: string | null;
  leadScore: number | null;
  classMode: string | null;
  expectedVisit: string | null;
  visitDate: string | null;
  visitTime: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
  feesOffered: number | null;
  finalFees: number | null;
  assignedToId: string | null;
  assignedToName: string | null;
}

/**
 * Send `payload` to the API and show `optimistic` in the row meanwhile.
 * Resolves false if the save failed — the caller has already said so.
 */
export type SaveLead = (
  lead: InlineLead,
  payload: Record<string, unknown>,
  optimistic: Partial<InlineLead>,
) => Promise<boolean>;

const inr = (n: number | null) =>
  n == null ? null : `₹${n.toLocaleString("en-IN")}`;

/** A stored day is UTC midnight, so its first ten characters are the day. */
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const isoDay = (day: string) => `${day}T00:00:00.000Z`;

const dash = <span className="text-muted-foreground">—</span>;

/** A call-back whose day has already passed reads as overdue. */
export function isOverdue(iso: string): boolean {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return new Date(iso) < start;
}

/** "29 Aug, 16:30" / "This Saturday" / null — whatever the counsellor captured. */
export function visitLabel(l: {
  visitDate: string | null;
  visitTime: string | null;
  expectedVisit: string | null;
}): string | null {
  if (l.visitDate) {
    return `${format(new Date(l.visitDate), "d MMM")}${l.visitTime ? `, ${l.visitTime}` : ""}`;
  }
  return l.expectedVisit;
}

// ── Building blocks ──────────────────────────────────────────────────────────

function EditTrigger({
  what,
  className,
  children,
}: {
  what: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PopoverTrigger
      className={cn(
        "group/edit hover:bg-muted/70 focus-visible:ring-ring/50 data-popup-open:bg-muted/70 -mx-1.5 -my-1 flex max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors outline-none focus-visible:ring-2",
        className,
      )}
    >
      {children}
      <span className="sr-only">Edit {what}</span>
      <Pencil className="text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" />
    </PopoverTrigger>
  );
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
        selected && "font-medium",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {children}
      </span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground px-2 pt-1 text-xs font-medium">
      {children}
    </p>
  );
}

function FormActions({
  saving,
  onClear,
  clearLabel = "Clear",
}: {
  saving: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      {onClear ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={onClear}
        >
          {clearLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" size="sm" disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        Save
      </Button>
    </div>
  );
}

// ── Stage / status ───────────────────────────────────────────────────────────

export function StageEditor({
  lead,
  onSave,
}: {
  lead: InlineLead;
  onSave: SaveLead;
}) {
  const [open, setOpen] = useState(false);
  const stage = lead.stage as LeadStage;
  const listed = LEAD_SUB_STATUSES[stage] ?? [];
  const statuses =
    lead.subStatus && !listed.includes(lead.subStatus)
      ? [lead.subStatus, ...listed]
      : listed;

  function pickStage(next: LeadStage) {
    if (next === lead.stage) return;
    // A status belongs to its stage — carry it over only if the new stage
    // lists it too. The menu stays open so the status can be picked next.
    const keep =
      lead.subStatus && LEAD_SUB_STATUSES[next].includes(lead.subStatus)
        ? lead.subStatus
        : null;
    void onSave(
      lead,
      { stage: next, subStatus: keep ?? "" },
      { stage: next, subStatus: keep },
    );
  }

  function pickStatus(next: string | null) {
    setOpen(false);
    if (next === lead.subStatus) return;
    void onSave(lead, { subStatus: next ?? "" }, { subStatus: next });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`stage for ${lead.name}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          {STAGE_BADGE(lead.stage)}
          {SUB_STATUS_BADGE(lead.subStatus)}
        </span>
      </EditTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-80 overflow-y-auto"
      >
        <Heading>Stage</Heading>
        <div className="grid grid-cols-2 gap-0.5">
          {LEAD_STAGES.map((s) => (
            <Option
              key={s}
              selected={s === lead.stage}
              onClick={() => pickStage(s)}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: LEAD_STAGE_COLORS[s] }}
              />
              <span className="truncate">{LEAD_STAGE_LABELS[s]}</span>
            </Option>
          ))}
        </div>
        <div className="border-t pt-1">
          <Heading>Status · {LEAD_STAGE_LABELS[stage] ?? lead.stage}</Heading>
          <Option selected={!lead.subStatus} onClick={() => pickStatus(null)}>
            <span className="text-muted-foreground">No status</span>
          </Option>
          {statuses.map((s) => (
            <Option
              key={s}
              selected={s === lead.subStatus}
              onClick={() => pickStatus(s)}
            >
              {s}
            </Option>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Quality + lead score ─────────────────────────────────────────────────────

export function QualityEditor({
  lead,
  onSave,
}: {
  lead: InlineLead;
  onSave: SaveLead;
}) {
  const [open, setOpen] = useState(false);

  function pick(next: string | null) {
    if (next === lead.quality) return;
    void onSave(lead, { quality: next ?? "" }, { quality: next });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`quality for ${lead.name}`}>
        <span className="flex items-center gap-1.5">
          {QUALITY_BADGE(lead.quality) ?? dash}
          {lead.leadScore != null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {lead.leadScore}
            </span>
          )}
        </span>
      </EditTrigger>
      <PopoverContent align="start" className="w-60">
        <Heading>Lead quality</Heading>
        <div>
          {LEAD_QUALITIES.map((q) => (
            <Option
              key={q}
              selected={q === lead.quality}
              onClick={() => pick(q)}
            >
              {LEAD_QUALITY_LABELS[q]}
            </Option>
          ))}
          <Option selected={!lead.quality} onClick={() => pick(null)}>
            <span className="text-muted-foreground">Not rated</span>
          </Option>
        </div>
        <div className="border-t pt-2">
          <ScoreForm
            lead={lead}
            onSave={onSave}
            onDone={() => setOpen(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Mounted only while the menu is open, so it seeds from the current score. */
function ScoreForm({
  lead,
  onSave,
  onDone,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  onDone: () => void;
}) {
  const [value, setValue] = useState(
    lead.leadScore != null ? String(lead.leadScore) : "",
  );
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();
  const score = trimmed ? Math.trunc(Number(trimmed)) : null;
  const invalid =
    score != null && (!Number.isFinite(score) || score < 0 || score > 100);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    if (score === lead.leadScore) return onDone();
    setSaving(true);
    const okay = await onSave(
      lead,
      { leadScore: score ?? "" },
      { leadScore: score },
    );
    setSaving(false);
    if (okay) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-1.5 px-1">
      <Label htmlFor={`score-${lead.id}`} className="text-xs">
        Lead score (0–100)
      </Label>
      <div className="flex gap-2">
        <Input
          id={`score-${lead.id}`}
          inputMode="numeric"
          value={value}
          placeholder="e.g. 80"
          aria-invalid={invalid || undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={saving || invalid}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </div>
      {invalid && (
        <p className="text-destructive text-xs">
          Enter a number from 0 to 100.
        </p>
      )}
    </form>
  );
}

// ── Class mode ───────────────────────────────────────────────────────────────

export function ClassModeEditor({
  lead,
  onSave,
}: {
  lead: InlineLead;
  onSave: SaveLead;
}) {
  const [open, setOpen] = useState(false);

  function pick(next: string | null) {
    setOpen(false);
    if (next === lead.classMode) return;
    void onSave(lead, { classMode: next ?? "" }, { classMode: next });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`class mode for ${lead.name}`}>
        <span className="text-sm">
          {lead.classMode ? CLASS_MODE_LABEL(lead.classMode) : dash}
        </span>
      </EditTrigger>
      <PopoverContent align="start" className="w-48">
        <Heading>Class mode</Heading>
        <div>
          {LEAD_CLASS_MODES.map((m) => (
            <Option
              key={m}
              selected={m === lead.classMode}
              onClick={() => pick(m)}
            >
              {LEAD_CLASS_MODE_LABELS[m]}
            </Option>
          ))}
          <Option selected={!lead.classMode} onClick={() => pick(null)}>
            <span className="text-muted-foreground">Not decided</span>
          </Option>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Visit ────────────────────────────────────────────────────────────────────

export function VisitEditor({
  lead,
  onSave,
}: {
  lead: InlineLead;
  onSave: SaveLead;
}) {
  const [open, setOpen] = useState(false);
  const label = visitLabel(lead);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`visit for ${lead.name}`}>
        <span className="text-sm whitespace-nowrap">{label ?? dash}</span>
      </EditTrigger>
      <PopoverContent align="start" className="w-72">
        <VisitForm lead={lead} onSave={onSave} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function VisitForm({
  lead,
  onSave,
  onDone,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  onDone: () => void;
}) {
  const [expected, setExpected] = useState(lead.expectedVisit ?? "");
  const [date, setDate] = useState(ymd(lead.visitDate));
  const [time, setTime] = useState(lead.visitTime ?? "");
  const [saving, setSaving] = useState(false);

  async function save(next: { expected: string; date: string; time: string }) {
    setSaving(true);
    const okay = await onSave(
      lead,
      {
        expectedVisit: next.expected.trim(),
        visitDate: next.date,
        visitTime: next.time,
      },
      {
        expectedVisit: next.expected.trim() || null,
        visitDate: next.date ? isoDay(next.date) : null,
        visitTime: next.time || null,
      },
    );
    setSaving(false);
    if (okay) onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save({ expected, date, time });
      }}
      className="space-y-2.5"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`visit-exp-${lead.id}`} className="text-xs">
          Expected visit
        </Label>
        <Input
          id={`visit-exp-${lead.id}`}
          value={expected}
          placeholder="e.g. This Saturday"
          onChange={(e) => setExpected(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`visit-date-${lead.id}`} className="text-xs">
            Visit date
          </Label>
          <Input
            id={`visit-date-${lead.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`visit-time-${lead.id}`} className="text-xs">
            Time
          </Label>
          <Input
            id={`visit-time-${lead.id}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <FormActions
        saving={saving}
        clearLabel="Clear date"
        onClear={
          lead.visitDate || lead.visitTime
            ? () => void save({ expected, date: "", time: "" })
            : undefined
        }
      />
    </form>
  );
}

// ── Next follow-up ───────────────────────────────────────────────────────────

export function FollowUpEditor({
  lead,
  onSave,
  className,
  prefix,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  className?: string;
  /** Shown before the date on the phone card: "Follow-up:". */
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const overdue = lead.followUpDate ? isOverdue(lead.followUpDate) : false;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger
        what={`next follow-up for ${lead.name}`}
        className={className}
      >
        <span
          className={cn(
            "text-sm whitespace-nowrap",
            overdue && "text-destructive font-medium",
          )}
        >
          {prefix}
          {lead.followUpDate ? (
            <>
              {format(new Date(lead.followUpDate), "d MMM")}
              {lead.followUpTime ? `, ${lead.followUpTime}` : ""}
            </>
          ) : (
            dash
          )}
        </span>
      </EditTrigger>
      <PopoverContent align="start" className="w-72">
        <FollowUpForm
          lead={lead}
          onSave={onSave}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function FollowUpForm({
  lead,
  onSave,
  onDone,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  onDone: () => void;
}) {
  const [date, setDate] = useState(ymd(lead.followUpDate));
  const [time, setTime] = useState(lead.followUpTime ?? "");
  const [saving, setSaving] = useState(false);

  // The counsellor's own calendar, not UTC's.
  const quick = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
  ].map((q) => ({
    ...q,
    value: format(addDays(new Date(), q.days), "yyyy-MM-dd"),
  }));

  async function save(nextDate: string, nextTime: string) {
    setSaving(true);
    const okay = await onSave(
      lead,
      { followUpDate: nextDate, followUpTime: nextTime },
      {
        followUpDate: nextDate ? isoDay(nextDate) : null,
        followUpTime: nextTime || null,
      },
    );
    setSaving(false);
    if (okay) onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(date, date ? time : "");
      }}
      className="space-y-2.5"
    >
      <p className="text-muted-foreground text-xs font-medium">
        Next follow-up
      </p>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <Button
            key={q.label}
            type="button"
            size="xs"
            variant={date === q.value ? "secondary" : "outline"}
            onClick={() => setDate(q.value)}
          >
            {q.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`fu-date-${lead.id}`} className="text-xs">
            Date
          </Label>
          <Input
            id={`fu-date-${lead.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fu-time-${lead.id}`} className="text-xs">
            Time
          </Label>
          <Input
            id={`fu-time-${lead.id}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <FormActions
        saving={saving}
        onClear={lead.followUpDate ? () => void save("", "") : undefined}
      />
    </form>
  );
}

// ── Fees ─────────────────────────────────────────────────────────────────────

export function FeesEditor({
  lead,
  onSave,
}: {
  lead: InlineLead;
  onSave: SaveLead;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`fees for ${lead.name}`}>
        <span className="text-sm whitespace-nowrap tabular-nums">
          {inr(lead.finalFees ?? lead.feesOffered) ?? dash}
        </span>
      </EditTrigger>
      <PopoverContent align="start" className="w-64">
        <FeesForm lead={lead} onSave={onSave} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function FeesForm({
  lead,
  onSave,
  onDone,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  onDone: () => void;
}) {
  const [offered, setOffered] = useState(
    lead.feesOffered != null ? String(lead.feesOffered) : "",
  );
  const [final, setFinal] = useState(
    lead.finalFees != null ? String(lead.finalFees) : "",
  );
  const [saving, setSaving] = useState(false);

  // Same reading as the form and the importer: "35k" is ₹35,000.
  const amount = (v: string) => (v.trim() ? (parseAmount(v) ?? NaN) : null);
  const offeredN = amount(offered);
  const finalN = amount(final);
  const bad = (n: number | null) =>
    n != null && (!Number.isFinite(n) || n < 0 || n > 10_000_000);
  const invalid = bad(offeredN) || bad(finalN);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    const okay = await onSave(
      lead,
      { feesOffered: offered.trim(), finalFees: final.trim() },
      { feesOffered: offeredN, finalFees: finalN },
    );
    setSaving(false);
    if (okay) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="space-y-1.5">
        <Label htmlFor={`fees-offered-${lead.id}`} className="text-xs">
          Fees offered (₹)
        </Label>
        <Input
          id={`fees-offered-${lead.id}`}
          inputMode="numeric"
          value={offered}
          placeholder="35000"
          onChange={(e) => setOffered(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`fees-final-${lead.id}`} className="text-xs">
          Final fees (₹)
        </Label>
        <Input
          id={`fees-final-${lead.id}`}
          inputMode="numeric"
          value={final}
          placeholder="Once negotiated"
          onChange={(e) => setFinal(e.target.value)}
        />
      </div>
      {invalid && (
        <p className="text-destructive text-xs">Enter a valid amount.</p>
      )}
      <FormActions saving={saving} />
    </form>
  );
}

// ── Assigned to ──────────────────────────────────────────────────────────────

export function AssigneeEditor({
  lead,
  onSave,
  assignees,
  viewerId,
}: {
  lead: InlineLead;
  onSave: SaveLead;
  assignees: AssigneeOption[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const people = assigneeOptions(
    assignees,
    lead.assignedToId && lead.assignedToName
      ? { id: lead.assignedToId, name: lead.assignedToName }
      : null,
  );
  const me = people.find((p) => p.id === viewerId);

  function pick(person: AssigneeOption | null) {
    setOpen(false);
    if ((person?.id ?? null) === lead.assignedToId) return;
    void onSave(
      lead,
      { assignedToId: person?.id ?? "" },
      {
        assignedToId: person?.id ?? null,
        assignedToName: person?.name ?? null,
      },
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <EditTrigger what={`assignee for ${lead.name}`}>
        <span className="text-sm">{lead.assignedToName ?? dash}</span>
      </EditTrigger>
      <PopoverContent
        align="start"
        className="max-h-[60vh] w-64 overflow-y-auto"
      >
        {me && me.id !== lead.assignedToId && (
          <div className="border-b pb-1">
            <Option selected={false} onClick={() => pick(me)}>
              Assign to me
            </Option>
          </div>
        )}
        <Heading>Assigned to</Heading>
        <div>
          <Option selected={!lead.assignedToId} onClick={() => pick(null)}>
            <span className="text-muted-foreground">Unassigned</span>
          </Option>
          {people.map((p) => (
            <Option
              key={p.id}
              selected={p.id === lead.assignedToId}
              onClick={() => pick(p)}
            >
              <AssigneeLabel person={p} />
            </Option>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
