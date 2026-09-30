"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Tick as many as apply.
 *
 * The academy kept hitting the ceiling of single-choice dropdowns — one course,
 * one batch — where the real answer was several. This is the same list the
 * group picker uses, without the nesting.
 */
export function MultiPicker({
  options,
  value,
  onChange,
  label,
  hint,
  emptyHint = "Nothing to choose from yet.",
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  hint?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const picked = useMemo(
    () => options.filter((o) => value.includes(o.id)),
    [options, value],
  );

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
              <span className="max-w-52 truncate">{o.label}</span>
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-label={`Remove ${o.label}`}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {options.length === 0 ? (
        <p className="text-muted-foreground text-xs">{emptyHint}</p>
      ) : (
        <>
          {options.length > 8 && (
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Find a ${label.toLowerCase().replace(/e?s$/, "")}…`}
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
          <div className="max-h-44 overflow-y-auto rounded-lg border">
            {shown.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">Nothing matches that.</p>
            ) : (
              shown.map((o) => {
                const on = value.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    className={cn(
                      "hover:bg-accent/60 flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm",
                      on && "bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        on ? "bg-primary border-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between">
            {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
            {value.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7"
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
