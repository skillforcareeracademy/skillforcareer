"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, UserPlus, X, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

interface Student {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface BatchStudentsTarget {
  id: string;
  name: string;
  capacity: number | null;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function BatchStudentsSheet({
  batch,
  onOpenChange,
}: {
  batch: BatchStudentsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={batch != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {batch && <Body key={batch.id} batch={batch} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ batch }: { batch: BatchStudentsTarget }) {
  const router = useRouter();
  const [added, setAdded] = useState<Student[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /** Re-read the roster after an add/remove. Called from handlers, not effects. */
  const loadAdded = useCallback(async () => {
    try {
      const d = await api.get<{ students: Student[] }>(`/api/batches/${batch.id}/students`);
      setAdded(d.students);
    } catch {
      setAdded([]);
    }
  }, [batch.id]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ students: Student[] }>(`/api/batches/${batch.id}/students`)
      .then((d) => alive && setAdded(d.students))
      .catch(() => alive && setAdded([]));
    return () => {
      alive = false;
    };
  }, [batch.id]);

  // Debounced so typing a name doesn't fire a query per keystroke. Everything
  // that touches state runs inside the timeout, never in the effect body.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      setSearching(true);
      const qs = new URLSearchParams({ candidates: "1" });
      if (search) qs.set("search", search);
      api
        .get<{ candidates: Student[] }>(`/api/batches/${batch.id}/students?${qs.toString()}`)
        .then((d) => alive && setResults(d.candidates))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, batch.id]);

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
        `/api/batches/${batch.id}/students`,
        { userIds: [...picked] },
      );
      toast.success(res.message);
      setPicked(new Set());
      await loadAdded();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add students.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(userId: string) {
    try {
      await api.del(`/api/batches/${batch.id}/students/${userId}`);
      toast.success("Student removed from batch.");
      await loadAdded();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove.");
    }
  }

  const addedIds = new Set((added ?? []).map((s) => s.userId));
  const selectable = results.filter((s) => !addedIds.has(s.userId));

  const enrolled = added?.length ?? 0;
  const cap = batch.capacity ?? 0;
  const overCapacity = cap > 0 && enrolled + picked.size > cap;
  const seatsNote =
    cap > 0
      ? `${enrolled} / ${cap} seats${enrolled >= cap ? " · full" : ` · ${cap - enrolled} left`}`
      : `${enrolled} enrolled`;

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle className="leading-snug">Students · {batch.name}</SheetTitle>
        <SheetDescription>
          Add learners who signed up offline. They&apos;re enrolled in this
          batch&apos;s course right away and appear on its roster.
        </SheetDescription>
      </SheetHeader>

      {/* Already on the batch */}
      <div className="border-b px-6 py-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" />
          On this batch
          {added && (
            <span className="text-muted-foreground font-normal">({seatsNote})</span>
          )}
        </p>
        {!added ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : added.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody added yet — search below to add students.
          </p>
        ) : (
          <div className="divide-y">
            {added.map((s) => (
              <div key={s.userId} className="flex items-center gap-3 py-2">
                <Avatar className="size-8 shrink-0">
                  {s.avatar && <AvatarImage src={s.avatar} alt={s.name} />}
                  <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{s.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => remove(s.userId)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add more */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students by name or email…"
            className="pl-9"
          />
        </div>

        <div className="mt-3 divide-y">
          {searching && results.length === 0 ? (
            <Skeleton className="h-12 w-full rounded-lg" />
          ) : selectable.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {search ? "No matching students." : "Everyone found is already on this batch."}
            </p>
          ) : (
            selectable.map((s) => (
              <label
                key={s.userId}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md py-2 pr-2 pl-1"
              >
                <Checkbox
                  checked={picked.has(s.userId)}
                  onCheckedChange={() => toggle(s.userId)}
                />
                <Avatar className="size-8 shrink-0">
                  {s.avatar && <AvatarImage src={s.avatar} alt={s.name} />}
                  <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{s.email}</p>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {picked.size > 0 && (
        <div className="bg-popover sticky bottom-0 border-t p-4">
          {overCapacity && (
            <p className="text-muted-foreground mb-2 text-center text-xs">
              This puts the batch over its {cap} seat capacity.
            </p>
          )}
          <Button className="w-full" onClick={addPicked} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Add {picked.size} student{picked.size === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}
