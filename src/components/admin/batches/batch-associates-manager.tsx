"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Search, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "./profile/format";

interface Person {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

/**
 * Add and remove a batch's associate instructors. Talks to
 * `/api/batches/[id]/associates` directly, so it works the same in the batch
 * profile and anywhere else it is dropped in.
 */
export function BatchAssociatesManager({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [associates, setAssociates] = useState<Person[] | null>(null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .get<{ associates: Person[] }>(`/api/batches/${batchId}/associates`)
      .then((d) => alive && setAssociates(d.associates))
      .catch(() => alive && setAssociates([]));
    return () => {
      alive = false;
    };
  }, [batchId, version]);

  // Debounced candidate search; state only changes inside the timeout.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      setSearching(true);
      const qs = new URLSearchParams({ candidates: "1" });
      if (search) qs.set("search", search);
      api
        .get<{ candidates: Person[] }>(
          `/api/batches/${batchId}/associates?${qs.toString()}`,
        )
        .then((d) => alive && setCandidates(d.candidates))
        .catch(() => alive && setCandidates([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, batchId, version]);

  async function add(p: Person) {
    setBusy(p.userId);
    try {
      const res = await api.post<{ message: string }>(
        `/api/batches/${batchId}/associates`,
        {
          userIds: [p.userId],
        },
      );
      toast.success(res.message);
      setVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't add that instructor.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Person) {
    setBusy(p.userId);
    try {
      await api.del(`/api/batches/${batchId}/associates/${p.userId}`);
      toast.success(`${p.name} removed.`);
      setVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Associate instructors</p>
        {!associates ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : associates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet — add one below.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {associates.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-3 py-2">
                <PersonRow person={p} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${p.name}`}
                  disabled={busy === p.userId}
                  onClick={() => remove(p)}
                >
                  {busy === p.userId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instructors by name or email…"
            className="pl-9"
          />
        </div>
        <div className="mt-2 max-h-64 divide-y overflow-y-auto">
          {searching && candidates.length === 0 ? (
            <Skeleton className="h-12 w-full rounded-lg" />
          ) : candidates.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              {search
                ? "No matching instructors."
                : "Every instructor is already on this batch."}
            </p>
          ) : (
            candidates.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 py-2 pr-1">
                <PersonRow person={p} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === p.userId}
                  onClick={() => add(p)}
                >
                  {busy === p.userId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PersonRow({ person }: { person: Person }) {
  return (
    <>
      <Avatar className="size-8 shrink-0">
        {person.avatar && <AvatarImage src={person.avatar} alt={person.name} />}
        <AvatarFallback className="text-xs">
          {initials(person.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="text-muted-foreground truncate text-xs">{person.email}</p>
      </div>
    </>
  );
}
