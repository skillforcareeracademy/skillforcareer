"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  FileQuestion,
  FileText,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The reading, the paper and the work that go together.
 *
 * A chapter, the quiz that tests it and the assignment that follows are one
 * thing to a learner. Linking them here puts each on the others — the link is
 * read from both ends — so a learner on any one of the three can reach the
 * rest. Several of each may be joined to one piece.
 */

export type LinkableKind = "QUIZ" | "MATERIAL" | "ASSIGNMENT";

const LABEL: Record<LinkableKind, string> = {
  QUIZ: "Quiz",
  MATERIAL: "Study material",
  ASSIGNMENT: "Assignment",
};

const ICON: Record<LinkableKind, typeof FileText> = {
  QUIZ: FileQuestion,
  MATERIAL: FileText,
  ASSIGNMENT: ClipboardList,
};

interface Linked {
  linkId: string;
  kind: LinkableKind;
  id: string;
  title: string;
  subtitle: string | null;
}

export function RelatedContent({
  kind,
  id,
  /** Learners see the list; staff can add to it and take from it. */
  canEdit = false,
  className,
}: {
  kind: LinkableKind;
  id: string;
  canEdit?: boolean;
  className?: string;
}) {
  const [linked, setLinked] = useState<Linked[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<LinkableKind | null>(null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<
    { id: string; title: string; subtitle: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ linked: Linked[] }>(
        `/api/content-links?kind=${kind}&id=${id}`,
      );
      setLinked(res.linked);
    } catch {
      // The page is still usable without the list.
    } finally {
      setLoading(false);
    }
  }, [kind, id]);

  // Deferred so the page paints first.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!picking) return;
    const t = setTimeout(() => {
      void api
        .get<{ options: typeof options }>(
          `/api/content-links?options=${picking}&search=${encodeURIComponent(search)}`,
        )
        .then((r) => setOptions(r.options))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [picking, search]);

  async function add(toKind: LinkableKind, toId: string) {
    setBusy(true);
    try {
      await api.post("/api/content-links", {
        fromKind: kind,
        fromId: id,
        toKind,
        toId,
      });
      setPicking(null);
      setSearch("");
      await load();
      toast.success("Linked.");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't link that.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(linkId: string) {
    try {
      await api.del(`/api/content-links/${linkId}`);
      await load();
    } catch {
      toast.error("Couldn't remove that link.");
    }
  }

  // A learner with nothing linked is shown nothing at all, rather than an
  // empty card that says so.
  if (!canEdit && !loading && linked.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" /> Goes with this
        </CardTitle>
        <CardDescription>
          {canEdit
            ? "The reading, papers and work that belong together. A learner on any one of them can reach the others."
            : "The reading, papers and work that go with this one."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : linked.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing linked yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {linked.map((l) => {
              const Icon = ICON[l.kind];
              return (
                <li
                  key={l.linkId}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {l.title}
                    </span>
                    {l.subtitle && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {l.subtitle}
                      </span>
                    )}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {LABEL[l.kind]}
                  </Badge>
                  {canEdit && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void remove(l.linkId)}
                      aria-label={`Unlink ${l.title}`}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {(["MATERIAL", "QUIZ", "ASSIGNMENT"] as LinkableKind[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant="outline"
                onClick={() => {
                  setPicking(k);
                  setSearch("");
                }}
              >
                <Plus className="size-4" /> {LABEL[k]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Link {picking ? LABEL[picking].toLowerCase() : ""}
            </DialogTitle>
            <DialogDescription>
              Pick as many as belong with this one. The link shows on both.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            autoFocus
          />
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {options.length === 0 ? (
              <li className="text-muted-foreground p-3 text-sm">
                Nothing matches that.
              </li>
            ) : (
              options.map((o) => {
                const already = linked.some(
                  (l) => l.kind === picking && l.id === o.id,
                );
                const self = picking === kind && o.id === id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={busy || already || self}
                      onClick={() => picking && void add(picking, o.id)}
                      className={cn(
                        "hover:bg-accent/50 block w-full px-3 py-2 text-left disabled:opacity-50",
                      )}
                    >
                      <span className="block truncate text-sm font-medium">
                        {o.title}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {self
                          ? "This is the one you are editing"
                          : already
                            ? "Already linked"
                            : (o.subtitle ?? "")}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
