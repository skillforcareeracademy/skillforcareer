"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

interface Participant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  userId: string | null;
  addedByStaff: boolean;
  joinedAt: string | null;
  attendedSeconds: number;
  attendedFully: boolean;
  createdAt: string;
}
interface Candidate {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface WebinarParticipantsTarget {
  id: string;
  title: string;
  capacity: number | null;
  durationMinutes: number;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function watched(seconds: number): string {
  if (seconds <= 0) return "not yet joined";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m watched` : `${Math.floor(m / 60)}h ${m % 60}m watched`;
}

/**
 * Who is on a webinar: everyone who signed up on the website, plus anyone staff
 * added by hand — and, once the session has run, how long each of them actually
 * stayed.
 */
export function WebinarParticipantsSheet({
  webinar,
  onOpenChange,
}: {
  webinar: WebinarParticipantsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={webinar != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {webinar && <Body key={webinar.id} webinar={webinar} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ webinar }: { webinar: WebinarParticipantsTarget }) {
  const router = useRouter();
  const [people, setPeople] = useState<Participant[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [addingGuest, setAddingGuest] = useState(false);

  /** Re-read the list after an add/remove. Called from handlers, not effects. */
  const load = useCallback(async () => {
    try {
      const d = await api.get<{ participants: Participant[] }>(
        `/api/webinars/${webinar.id}/participants`,
      );
      setPeople(d.participants);
    } catch {
      setPeople([]);
    }
  }, [webinar.id]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ participants: Participant[] }>(`/api/webinars/${webinar.id}/participants`)
      .then((d) => alive && setPeople(d.participants))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, [webinar.id]);

  // Debounced, so typing a name doesn't fire a query per keystroke.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      setSearching(true);
      const qs = new URLSearchParams({ candidates: "1" });
      if (search) qs.set("search", search);
      api
        .get<{ candidates: Candidate[] }>(
          `/api/webinars/${webinar.id}/participants?${qs.toString()}`,
        )
        .then((d) => alive && setResults(d.candidates))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, webinar.id]);

  function toggle(userId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function addPicked() {
    if (picked.size === 0) return;
    setSaving(true);
    try {
      const res = await api.post<{ count: number; message: string }>(
        `/api/webinars/${webinar.id}/participants`,
        { userIds: [...picked] },
      );
      toast.success(res.message);
      setPicked(new Set());
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add participants.");
    } finally {
      setSaving(false);
    }
  }

  async function addGuest(e: FormEvent) {
    e.preventDefault();
    setAddingGuest(true);
    try {
      const res = await api.post<{ count: number; message: string }>(
        `/api/webinars/${webinar.id}/participants`,
        {
          guests: [
            { name: guest.name, email: guest.email, phone: guest.phone || undefined },
          ],
        },
      );
      toast.success(res.message);
      setGuest({ name: "", email: "", phone: "" });
      await load();
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(
        d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't add."),
      );
    } finally {
      setAddingGuest(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/api/webinars/${webinar.id}/participants/${id}`);
      toast.success("Participant removed.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove.");
    }
  }

  const onList = new Set((people ?? []).map((p) => p.email.toLowerCase()));
  const selectable = results.filter((r) => !onList.has(r.email.toLowerCase()));
  const count = people?.length ?? 0;
  const cap = webinar.capacity ?? 0;
  const seatsNote =
    cap > 0
      ? `${count} / ${cap} seats${count >= cap ? " · full" : ` · ${cap - count} left`}`
      : `${count} registered`;
  const attendedCount = (people ?? []).filter((p) => p.attendedFully).length;

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle className="leading-snug">Participants · {webinar.title}</SheetTitle>
        <SheetDescription>
          Everyone who registered on the website, plus anyone you add here.
          Attendance and watch time are recorded automatically when they join
          the webinar room.
        </SheetDescription>
      </SheetHeader>

      <div className="border-b px-6 py-4">
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium">
          <Users className="size-4" />
          On this webinar
          {people && <span className="text-muted-foreground font-normal">({seatsNote})</span>}
          {attendedCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            >
              {attendedCount} attended fully
            </Badge>
          )}
        </p>

        {!people ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : people.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody yet — registrations from the website land here automatically.
          </p>
        ) : (
          <div className="divide-y">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {p.name}
                    {p.attendedFully && (
                      <CheckCircle2
                        className="size-3.5 shrink-0 text-emerald-600"
                        aria-label="Attended the full session"
                      />
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {p.email}
                    {p.joinedAt
                      ? ` · ${format(new Date(p.joinedAt), "d MMM, h:mm a")} · ${watched(p.attendedSeconds)}`
                      : p.addedByStaff
                        ? " · added by staff"
                        : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => remove(p.id)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Learners who already have an account */}
      <div className="border-b px-6 py-4">
        <p className="mb-3 text-sm font-medium">Add learners</p>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>

        <div className="mt-3 divide-y">
          {searching && results.length === 0 ? (
            <Skeleton className="h-12 w-full rounded-lg" />
          ) : selectable.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {search ? "No matching people." : "Everyone found is already on this webinar."}
            </p>
          ) : (
            selectable.map((c) => (
              <label
                key={c.userId}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md py-2 pr-2 pl-1"
              >
                <Checkbox
                  checked={picked.has(c.userId)}
                  onCheckedChange={() => toggle(c.userId)}
                />
                <Avatar className="size-8 shrink-0">
                  {c.avatar && <AvatarImage src={c.avatar} alt={c.name} />}
                  <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{c.email}</p>
                </div>
              </label>
            ))
          )}
        </div>

        {picked.size > 0 && (
          <Button className="mt-3 w-full" onClick={addPicked} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Add {picked.size} participant{picked.size === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {/* Walk-ins with no account */}
      <form onSubmit={addGuest} className="space-y-3 px-6 py-4">
        <p className="text-sm font-medium">Add someone by hand</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-name">Name</Label>
            <Input
              id="wp-name"
              value={guest.name}
              onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-email">Email</Label>
            <Input
              id="wp-email"
              type="email"
              value={guest.email}
              onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
              placeholder="name@example.com"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-phone">Phone (optional)</Label>
          <Input
            id="wp-phone"
            value={guest.phone}
            onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))}
            placeholder="+91…"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={addingGuest || guest.name.trim().length < 2 || !guest.email.includes("@")}
        >
          {addingGuest ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Add participant
        </Button>
      </form>
    </div>
  );
}
