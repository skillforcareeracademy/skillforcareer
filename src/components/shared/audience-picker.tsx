"use client";

import { useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AudienceOption {
  id: string;
  label: string;
  /** Second line — a course title for a batch, an email for a learner. */
  hint?: string | null;
}

/**
 * Pick any number of batches, or any number of individual learners, for a piece
 * of work.
 *
 * Assignments and quizzes are set the same way — "these cohorts, plus these few
 * people" — so both use this rather than growing two near-identical lists.
 * Selecting nothing means everyone on the course, which is the behaviour the
 * platform had before audiences existed.
 */
export function AudiencePicker({
  label,
  emptyMeans,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search…",
  maxHeight = "16rem",
}: {
  label: string;
  /** What no selection implies, spelled out under the label. */
  emptyMeans: string;
  options: AudienceOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  searchPlaceholder?: string;
  maxHeight?: string;
}) {
  const [query, setQuery] = useState("");

  const picked = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  function toggle(id: string) {
    onChange(picked.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const chosen = options.filter((o) => picked.has(o.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        {selected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7"
            onClick={() => onChange([])}
          >
            <X className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      {chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pr-1 font-normal">
              {o.label}
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-label={`Remove ${o.label}`}
                className="hover:bg-background/70 rounded-full p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{emptyMeans}</p>
      )}

      <div className="rounded-lg border">
        <div className="relative border-b">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="border-0 pl-9 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="overflow-y-auto p-1" style={{ maxHeight }}>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
              <Users className="size-4" /> Nothing to choose from.
            </p>
          ) : (
            filtered.map((o) => {
              const on = picked.has(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2",
                    on && "bg-muted/40",
                  )}
                >
                  <Checkbox checked={on} onCheckedChange={() => toggle(o.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.label}</span>
                    {o.hint && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {on && <Check className="text-primary size-4 shrink-0" />}
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
