"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MailCheck,
  PartyPopper,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { HolidayRow } from "@/server/services/holiday-service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Admin → Holidays. Festivals and holidays for the year: on the day, every
 * student and instructor gets a greeting (email + in-app) at 7:30 am IST; on a
 * "No classes" day the timetable skips the date and any auto-scheduled class
 * already on it is cancelled, with its learners told.
 *
 * Lunar festivals move every year and some depend on the moon being sighted,
 * so a holiday can carry a "Check the date" flag: its wishes are held back
 * until someone confirms the date here.
 */

interface FormState {
  date: string;
  name: string;
  message: string;
  noClasses: boolean;
  sendWishes: boolean;
  needsDateCheck: boolean;
}

const BLANK: FormState = {
  date: "",
  name: "",
  message: "",
  noClasses: true,
  sendWishes: true,
  needsDateCheck: false,
};

/** A calendar day ("2026-11-08") as text, without letting a time zone shift it. */
function dayLabel(key: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
}

export function HolidaysClient({
  year,
  years,
  holidays,
  today,
}: {
  year: number;
  years: number[];
  holidays: HolidayRow[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<HolidayRow | null>(null);

  const noClassDays = holidays.filter((h) => h.noClasses).length;
  const toCheck = holidays.filter((h) => h.needsDateCheck && h.date >= today).length;
  const canPrev = years.includes(year - 1);
  const canNext = years.includes(year + 1);

  function goYear(y: number) {
    router.push(`${pathname}?year=${y}`);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK, date: year === Number(today.slice(0, 4)) ? today : `${year}-01-01` });
    setFormOpen(true);
  }

  function openEdit(h: HolidayRow) {
    setEditing(h);
    setForm({
      date: h.date,
      name: h.name,
      message: h.message,
      noClasses: h.noClasses,
      sendWishes: h.sendWishes,
      needsDateCheck: h.needsDateCheck,
    });
    setFormOpen(true);
  }

  function classesNote(res: { classesCancelled: number; classesRestored: number }): string {
    const parts = [
      res.classesCancelled && `${res.classesCancelled} class${res.classesCancelled === 1 ? "" : "es"} cancelled`,
      res.classesRestored && `${res.classesRestored} class${res.classesRestored === 1 ? "" : "es"} put back`,
    ].filter(Boolean);
    return parts.length ? ` — ${parts.join(", ")}; learners notified.` : ".";
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await api.patch<{ classesCancelled: number; classesRestored: number }>(`/api/holidays/${editing.id}`, form)
        : await api.post<{ classesCancelled: number; classesRestored: number }>("/api/holidays", form);
      toast.success(`${editing ? "Holiday saved" : "Holiday added"}${classesNote(res)}`);
      setFormOpen(false);
      const savedYear = Number(form.date.slice(0, 4));
      if (savedYear !== year) goYear(savedYear);
      else router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the holiday.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await api.del<{ classesCancelled: number; classesRestored: number }>(`/api/holidays/${deleting.id}`);
      toast.success(`Holiday deleted${classesNote(res)}`);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays & festivals"
        description="Wishes go to every student and instructor at 7:30 am IST on the day. On a “No classes” day the timetable skips the date."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add holiday
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={!canPrev} onClick={() => goYear(year - 1)} aria-label="Previous year">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-16 text-center text-lg font-semibold tabular-nums">{year}</span>
          <Button variant="outline" size="icon-sm" disabled={!canNext} onClick={() => goYear(year + 1)} aria-label="Next year">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
          <span className="bg-muted rounded-full px-2.5 py-1">{holidays.length} holidays</span>
          <span className="bg-muted rounded-full px-2.5 py-1">{noClassDays} with no classes</span>
          {toCheck > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300">
              {toCheck} date{toCheck === 1 ? "" : "s"} to check
            </span>
          )}
        </div>
      </div>

      {holidays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <PartyPopper className="text-muted-foreground mb-3 size-8" />
            <p className="text-sm font-medium">No holidays for {year} yet</p>
            <p className="text-muted-foreground mt-1 text-xs">Add festivals and holidays to send wishes and skip classes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {holidays.map((h) => {
            const past = h.date < today;
            const isToday = h.date === today;
            return (
              <Card key={h.id} className={cn("py-0", past && "opacity-60")}>
                <CardContent className="flex items-start gap-3 py-3">
                  <div
                    className={cn(
                      "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl",
                      isToday ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted",
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase">{dayLabel(h.date, { month: "short" })}</span>
                    <span className="text-xl leading-none font-bold">{dayLabel(h.date, { day: "numeric" })}</span>
                    <span className="text-[10px]">{dayLabel(h.date, { weekday: "short" })}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {h.name}
                      {isToday && <span className="ml-2 text-xs font-normal text-amber-600">Today</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {h.needsDateCheck && (
                        <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="size-3" /> Check the date
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1">
                        {h.noClasses ? <CalendarOff className="size-3" /> : null}
                        {h.noClasses ? "No classes" : "Classes run"}
                      </Badge>
                      <Badge variant="outline">{h.sendWishes ? "Sends wishes" : "No wishes"}</Badge>
                      {h.wishesSentAt && (
                        <Badge variant="secondary" className="gap-1">
                          <MailCheck className="size-3" /> Wishes sent
                        </Badge>
                      )}
                    </div>
                    {h.message && <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm">{h.message}</p>}
                    {h.needsDateCheck && !past && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        This date comes from a lunar calendar and may shift by a day. Wishes won&apos;t go out
                        until you confirm it.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(h)} aria-label={`Edit ${h.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(h)} aria-label={`Delete ${h.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
            <DialogDescription>
              The greeting goes by email and in-app to every active student and instructor on the day.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="h-date">Date</Label>
                <Input
                  id="h-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-name">Name</Label>
                <Input
                  id="h-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Diwali"
                  maxLength={120}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-message">Greeting</Label>
              <Textarea
                id="h-message"
                rows={3}
                maxLength={2000}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="e.g. May the festival of lights bring joy and success to you and your family."
              />
              {form.noClasses && (
                <p className="text-muted-foreground text-xs">
                  The email adds: &ldquo;Enjoy your holiday as there is no class scheduled for today.&rdquo;
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">No classes</span>
                  <span className="text-muted-foreground block text-xs">
                    Skip this date in every timetable and cancel auto-scheduled classes on it (learners are told).
                  </span>
                </span>
                <Switch checked={form.noClasses} onCheckedChange={(v) => setForm((f) => ({ ...f, noClasses: v }))} />
              </label>
              <label className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">Send wishes</span>
                  <span className="text-muted-foreground block text-xs">
                    Email and notify every student and instructor on the day.
                  </span>
                </span>
                <Switch checked={form.sendWishes} onCheckedChange={(v) => setForm((f) => ({ ...f, sendWishes: v }))} />
              </label>
              <label className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">Date still needs checking</span>
                  <span className="text-muted-foreground block text-xs">
                    For lunar or moon-sighted festivals. Wishes are held back until you switch this off.
                  </span>
                </span>
                <Switch
                  checked={form.needsDateCheck}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, needsDateCheck: v }))}
                />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.date || form.name.trim().length < 2}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Add holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.noClasses
                ? "Classes the timetable cancelled for this day will be put back, and their learners told."
                : "No wishes will go out for it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
