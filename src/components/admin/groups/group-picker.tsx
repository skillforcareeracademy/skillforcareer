"use client";

import { useMemo, useState } from "react";
import { Check, FolderTree, Pencil, Search, X } from "lucide-react";
import type { GroupOption } from "@/server/services/content-group-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Pick any number of folders for one item.
 *
 * "Multiple groups can be selected in quiz, curriculum, study material,
 * assignment." A flat list with indentation rather than a tree of checkboxes:
 * the academy nests three or four deep, and a picker you have to unfold before
 * you can tick anything is slower than the list it replaced.
 */
export function GroupPicker({
  options,
  value,
  onChange,
  onRename,
  label = "Groups",
  hint = "File it in as many as you like. Sub-groups are listed under their parent.",
  emptyHint = "No groups yet — add some under Groups.",
}: {
  options: GroupOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** When given, each group gets a pencil to rename it in place. */
  onRename?: (id: string, name: string) => Promise<void>;
  label?: string;
  hint?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function saveRename(id: string) {
    const name = draft.trim();
    if (!name || !onRename) {
      setEditId(null);
      return;
    }
    try {
      await onRename(id, name);
      setEditId(null);
    } catch {
      // The parent surfaces the error; keep the row open so it can be retried.
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.path.toLowerCase().includes(q));
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
          {picked.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
              {g.path}
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-label={`Remove ${g.path}`}
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
          {options.length > 5 && (
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a group…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto rounded-lg border">
            {shown.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">Nothing matches that.</p>
            ) : (
              shown.map((g) => {
                const on = value.includes(g.id);
                const editing = editId === g.id;
                return (
                  <div
                    key={g.id}
                    className={cn(
                      "flex items-center gap-1 pr-1",
                      on && !editing && "bg-accent/40",
                    )}
                    style={{ paddingLeft: `${0.625 + g.depth * 1}rem` }}
                  >
                    {editing ? (
                      <form
                        className="flex flex-1 items-center gap-1 py-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveRename(g.id);
                        }}
                      >
                        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                        <Input
                          value={draft}
                          autoFocus
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && setEditId(null)}
                          className="h-7 text-sm"
                        />
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save name">
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Cancel"
                          onClick={() => setEditId(null)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggle(g.id)}
                          className="hover:bg-accent/60 -ml-2.5 flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 pl-2.5 text-left text-sm"
                        >
                          <span
                            className={cn(
                              "grid size-4 shrink-0 place-items-center rounded border",
                              on
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-input",
                            )}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <FolderTree className="text-muted-foreground size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{g.name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {g.count}
                          </span>
                        </button>
                        {onRename && (
                          <button
                            type="button"
                            aria-label={`Rename ${g.name}`}
                            onClick={() => {
                              setEditId(g.id);
                              setDraft(g.name);
                            }}
                            className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">{hint}</p>
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
