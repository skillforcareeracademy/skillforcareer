"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ExternalLink,
  Eye,
  Loader2,
  MonitorSmartphone,
  RotateCcw,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { AudiencePicker } from "@/components/shared/audience-picker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface DeviceRow {
  deviceId: string;
  label: string | null;
  lastSeenAt: string;
}

interface ViewerRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  viewCount: number;
  viewLimit: number | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  secondsWatched: number;
  watermarkWaivedAt: string | null;
  devices: DeviceRow[];
}

interface Control {
  meetingId: string;
  title: string;
  hasFile: boolean;
  recordingUrl: string | null;
  published: boolean;
  publishedAt: string | null;
  availableDays: number | null;
  availableUntil: string | null;
  effectiveUntil: string | null;
  viewLimit: number;
  deviceLimit: number;
  watermark: boolean;
  watermarkRemovalPrice: number | null;
  audience: { batchIds: string[]; studentIds: string[] };
  batches: { id: string; name: string; courseTitle: string | null }[];
  learners: { id: string; name: string; email: string }[];
  viewers: ViewerRow[];
}

/** The editable half, kept as strings so a cleared number input stays cleared. */
interface Form {
  published: boolean;
  availableDays: string;
  availableUntil: string;
  viewLimit: string;
  deviceLimit: string;
  watermark: boolean;
  watermarkRemovalPrice: string;
  batchIds: string[];
  studentIds: string[];
}

function toForm(c: Control): Form {
  return {
    published: c.published,
    availableDays: c.availableDays == null ? "" : String(c.availableDays),
    availableUntil: c.availableUntil ?? "",
    viewLimit: String(c.viewLimit),
    deviceLimit: String(c.deviceLimit),
    watermark: c.watermark,
    watermarkRemovalPrice:
      c.watermarkRemovalPrice == null ? "" : String(c.watermarkRemovalPrice),
    batchIds: c.audience.batchIds,
    studentIds: c.audience.studentIds,
  };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function minutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Admin → Live classes → Recording.
 *
 * The whole of the client's ask lives on this panel: publish or hold back the
 * file, how long it stays up, how many watches and how many devices each learner
 * gets, whether the overlay is on and what it costs to remove — plus who the
 * recording is for, and a register of who has actually watched it.
 *
 * Loaded on demand rather than with the rest of the detail sheet: it is four
 * extra queries, and most visits to a live class are not about its recording.
 */
export function RecordingControl({ meetingId }: { meetingId: string }) {
  const [data, setData] = useState<Control | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Control>(`/api/meetings/${meetingId}/recording/control`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setForm(toForm(d));
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [meetingId]);

  async function refresh() {
    try {
      const d = await api.get<Control>(
        `/api/meetings/${meetingId}/recording/control`,
      );
      setData(d);
      setForm(toForm(d));
    } catch {
      /* the panel keeps what it has */
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch(`/api/meetings/${meetingId}/recording/control`, {
        published: form.published,
        availableDays: form.availableDays,
        availableUntil: form.availableUntil,
        viewLimit: form.viewLimit,
        deviceLimit: form.deviceLimit,
        watermark: form.watermark,
        watermarkRemovalPrice: form.watermarkRemovalPrice,
        batchIds: form.batchIds,
        studentIds: form.studentIds,
      });
      toast.success("Recording settings saved.");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save the settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function viewerAction(
    userId: string,
    body: Record<string, unknown>,
    done: string,
  ) {
    setBusyUser(userId);
    try {
      await api.post(
        `/api/meetings/${meetingId}/recording/viewers/${userId}`,
        body,
      );
      toast.success(done);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't do that.");
    } finally {
      setBusyUser(null);
    }
  }

  if (error) {
    return (
      <section className="rounded-xl border p-4">
        <SectionTitle>Recording</SectionTitle>
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t load the recording settings.
        </p>
      </section>
    );
  }

  if (!data || !form) {
    return (
      <section className="space-y-3 rounded-xl border p-4">
        <SectionTitle>Recording</SectionTitle>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
      </section>
    );
  }

  if (!data.hasFile) {
    return (
      <section className="rounded-xl border p-4">
        <SectionTitle>Recording</SectionTitle>
        <p className="text-muted-foreground text-sm">
          Nothing recorded yet. Once the host ends the class, the recording is
          uploaded here and these controls become live.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border p-4">
      <SectionTitle>Recording</SectionTitle>

      {/* Publish + staff preview */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="rec-published">Published to learners</Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {form.published
                ? data.publishedAt
                  ? `Live since ${format(new Date(data.publishedAt), "d MMM yyyy")}.`
                  : "Live for everyone in the audience below."
                : "Uploaded but hidden. Learners see nothing until you turn this on."}
            </p>
          </div>
          <Switch
            id="rec-published"
            checked={form.published}
            onCheckedChange={(v) => set("published", v)}
          />
        </div>

        {data.recordingUrl && (
          <a
            href={data.recordingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1.5 text-xs hover:underline"
          >
            <ExternalLink className="size-3.5" /> Preview the file (staff only)
          </a>
        )}
      </div>

      {/* Availability */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-days">Days after publishing</Label>
          <Input
            id="rec-days"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="No cut-off"
            value={form.availableDays}
            onChange={(e) => set("availableDays", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-until">Or available until</Label>
          <Input
            id="rec-until"
            type="date"
            value={form.availableUntil}
            onChange={(e) => set("availableUntil", e.target.value)}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        {data.effectiveUntil
          ? `Access currently ends ${format(new Date(data.effectiveUntil), "d MMM yyyy")}.`
          : "Leave both blank and the recording stays up indefinitely."}{" "}
        A date wins over the day count when both are set.
      </p>

      {/* Limits */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-views">Views per learner</Label>
          <Input
            id="rec-views"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.viewLimit}
            onChange={(e) => set("viewLimit", e.target.value)}
          />
          <p className="text-muted-foreground text-xs">0 = unlimited</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-devices">Devices per learner</Label>
          <Input
            id="rec-devices"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.deviceLimit}
            onChange={(e) => set("deviceLimit", e.target.value)}
          />
          <p className="text-muted-foreground text-xs">0 = unlimited</p>
        </div>
      </div>

      {/* Watermark */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="rec-watermark">Watermark the player</Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              &ldquo;Skill For Career&rdquo; plus the learner&apos;s own name
              and email drift slowly over the video.
            </p>
          </div>
          <Switch
            id="rec-watermark"
            checked={form.watermark}
            onCheckedChange={(v) => set("watermark", v)}
          />
        </div>
        {form.watermark && (
          <div className="space-y-1.5">
            <Label htmlFor="rec-price">Price to remove it (₹)</Label>
            <Input
              id="rec-price"
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              placeholder="Not for sale"
              value={form.watermarkRemovalPrice}
              onChange={(e) => set("watermarkRemovalPrice", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {form.watermarkRemovalPrice &&
              Number(form.watermarkRemovalPrice) > 0
                ? `Learners see a "Watch without the watermark · ${inr(
                    Number(form.watermarkRemovalPrice),
                  )}" button and pay through Razorpay. It clears the overlay on this recording only.`
                : "Leave blank and no button is offered — the overlay simply stays."}
            </p>
          </div>
        )}
      </div>

      {/* Audience */}
      <div className="space-y-4">
        <AudiencePicker
          label="Batches that may watch"
          emptyMeans="No batch chosen — everyone who could attend the class can watch it back."
          searchPlaceholder="Search batches…"
          options={data.batches.map((b) => ({
            id: b.id,
            label: b.name,
            hint: b.courseTitle,
          }))}
          selected={form.batchIds}
          onChange={(ids) => set("batchIds", ids)}
          maxHeight="11rem"
        />
        <AudiencePicker
          label="Individual learners"
          emptyMeans="Nobody added individually."
          searchPlaceholder="Search learners…"
          options={data.learners.map((l) => ({
            id: l.id,
            label: l.name,
            hint: l.email,
          }))}
          selected={form.studentIds}
          onChange={(ids) => set("studentIds", ids)}
          maxHeight="11rem"
        />
      </div>

      <Button type="button" onClick={save} disabled={saving} className="w-full">
        {saving && <Loader2 className="size-4 animate-spin" />}
        Save recording settings
      </Button>

      {/* Who watched */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="text-muted-foreground size-4" />
          Who watched
          <span className="text-muted-foreground font-normal">
            ({data.viewers.length})
          </span>
        </div>

        {data.viewers.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
            Nobody has opened this recording yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.viewers.map((v) => (
              <li key={v.userId} className="space-y-2 p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="size-8 shrink-0">
                    {v.avatarUrl && (
                      <AvatarImage src={v.avatarUrl} alt={v.name} />
                    )}
                    <AvatarFallback className="text-xs">
                      {initials(v.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {v.email}
                    </p>
                  </div>
                  {v.watermarkWaivedAt && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 gap-1 text-[10px]"
                    >
                      <ShieldCheck className="size-3" /> Watermark bought
                    </Badge>
                  )}
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5" />
                    {v.viewCount} of {v.viewLimit ?? "∞"} views
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MonitorSmartphone className="size-3.5" />
                    {v.devices.length}{" "}
                    {v.devices.length === 1 ? "device" : "devices"}
                  </span>
                  {v.secondsWatched > 0 && (
                    <span>{minutes(v.secondsWatched)} watched</span>
                  )}
                  {v.lastViewedAt && (
                    <span>
                      Last {format(new Date(v.lastViewedAt), "d MMM, h:mm a")}
                    </span>
                  )}
                </div>

                {v.devices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {v.devices.map((d) => (
                      <Badge
                        key={d.deviceId}
                        variant="secondary"
                        className="gap-1 pr-1 text-[10px] font-normal"
                      >
                        {d.label ?? "Unknown device"}
                        <button
                          type="button"
                          disabled={busyUser === v.userId}
                          aria-label={`Remove ${d.label ?? "this device"}`}
                          onClick={() =>
                            viewerAction(
                              v.userId,
                              { action: "remove-device", deviceId: d.deviceId },
                              "Device removed.",
                            )
                          }
                          className="hover:bg-background/70 rounded-full p-0.5 disabled:opacity-50"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={busyUser === v.userId || v.viewCount === 0}
                  onClick={() =>
                    viewerAction(
                      v.userId,
                      { action: "reset-views" },
                      "Views reset.",
                    )
                  }
                >
                  {busyUser === v.userId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Reset views
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <Video className="text-muted-foreground size-4" />
      {children}
    </div>
  );
}
