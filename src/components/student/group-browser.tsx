"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, FolderOpen, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Groups first, contents on a tap.
 *
 * "Quiz and study material should be visible in groups then student can click
 * on group to open content. Access Group wise and sub group wise." So a learner
 * lands on the subjects, opens one, and only then sees the papers or the
 * reading inside it — the same two levels the academy files them under.
 *
 * Searching cuts across the whole lot: when there is a query, the grouping gets
 * out of the way and every match is listed flat, because nobody hunting for a
 * title wants to guess which folder it is in.
 *
 * Folders nest as deeply as the academy files them. This used to hold a group
 * and a sub-group only, so a deeper shelf had its remaining path folded into
 * one name and the same folder appeared once per file inside it — "Medical
 * Anatomy → Chapter 1" and "Medical Anatomy → Chapter 2" side by side where
 * there should have been a single Medical Anatomy to open.
 */

export interface Grouped {
  categoryName: string | null;
  subCategoryName: string | null;
  /** The full folder path. Falls back to the two names above when absent. */
  groupPath?: string[] | null;
}

/** Items the academy never filed anywhere still need somewhere to live. */
const UNGROUPED = "Everything else";

/** Where one item is filed, deepest-last. Never empty. */
function pathOf(i: Grouped): string[] {
  const full = (i.groupPath ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  if (full.length > 0) return full;
  const legacy = [i.categoryName, i.subCategoryName]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean);
  return legacy.length > 0 ? legacy : [UNGROUPED];
}

const samePath = (a: string[], b: string[]) =>
  a.length === b.length && a.every((seg, n) => seg === b[n]);

const startsWith = (path: string[], trail: string[]) =>
  trail.every((seg, n) => path[n] === seg);

/** One folder directly inside the trail, and everything beneath it. */
interface Child {
  name: string;
  /** Every item below this folder, however deep. */
  count: number;
}

/** All quizzes › Anatomy › Upper limb › Humerus — and the way back up. */
function Crumbs({
  many,
  trail,
  onGo,
}: {
  many: string;
  /** The folders currently open, outermost first. */
  trail: string[];
  /** Jump to a depth: 0 is the top, 1 is the first folder, and so on. */
  onGo: (depth: number) => void;
}) {
  return (
    <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onGo(0)}
        className="hover:text-foreground font-medium"
      >
        All {many}
      </button>
      {trail.map((name, depth) => (
        <span key={`${depth}-${name}`} className="flex items-center gap-1">
          <ChevronRight className="size-3.5" />
          <button
            type="button"
            onClick={() => onGo(depth + 1)}
            className={cn(
              "hover:text-foreground",
              depth === trail.length - 1 && "text-foreground font-medium",
            )}
          >
            {name}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** One subject, and how much is filed under it. */
function GroupCard({
  name,
  count,
  noun,
  onOpen,
  icon: Icon,
}: {
  name: string;
  count: number;
  noun: { one: string; many: string };
  onOpen: () => void;
  icon: typeof Layers;
}) {
  return (
    <button type="button" onClick={onOpen} className="text-left">
      <Card className="hover:border-primary/60 h-full transition-colors">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
            <Icon className="text-muted-foreground size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{name}</span>
            <span className="text-muted-foreground block text-xs">
              {count} {count === 1 ? noun.one : noun.many}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </CardContent>
      </Card>
    </button>
  );
}

export function GroupBrowser<T extends Grouped>({
  items,
  renderItem,
  noun,
  /** A live search query; when set, the grouping steps aside. */
  query,
  columns = "sm:grid-cols-2",
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  noun: { one: string; many: string };
  query?: string;
  columns?: string;
}) {
  /** The folders currently open, outermost first. Empty is the top level. */
  const [trail, setTrail] = useState<string[]>([]);

  const paths = useMemo(() => items.map((i) => pathOf(i)), [items]);

  /**
   * The folders sitting directly inside the trail, each counting everything
   * beneath it however deep — so one Medical Anatomy card says "2 items", and
   * opening it reveals the two chapters.
   */
  const children = useMemo(() => {
    const found = new Map<string, Child>();
    paths.forEach((path) => {
      if (path.length <= trail.length || !startsWith(path, trail)) return;
      const name = path[trail.length];
      const node = found.get(name) ?? { name, count: 0 };
      node.count += 1;
      found.set(name, node);
    });
    // The academy's own order is the order the items arrive in; the leftovers
    // always come last.
    return [...found.values()].sort((a, b) =>
      a.name === UNGROUPED ? 1 : b.name === UNGROUPED ? -1 : 0,
    );
  }, [paths, trail]);

  /** What is filed in this folder itself, rather than in one below it. */
  const here = useMemo(
    () => items.filter((_, n) => samePath(paths[n], trail)),
    [items, paths, trail],
  );

  const searching = Boolean(query && query.trim());

  // Searching: one flat list, no folders in the way.
  if (searching) {
    return (
      <div className={cn("grid gap-4", columns)}>
        {items.map((i) => renderItem(i))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Crumbs
        many={noun.many}
        trail={trail}
        onGo={(depth) => setTrail((t) => t.slice(0, depth))}
      />

      {children.length > 0 && (
        <div className={cn("grid gap-3", columns)}>
          {children.map((c) => (
            <GroupCard
              key={c.name}
              name={c.name}
              count={c.count}
              noun={noun}
              icon={trail.length === 0 ? Layers : FolderOpen}
              onOpen={() => setTrail((t) => [...t, c.name])}
            />
          ))}
        </div>
      )}

      {here.length > 0 && (
        <div className={cn("grid gap-4", columns)}>
          {here.map((i) => renderItem(i))}
        </div>
      )}

      {children.length === 0 && here.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {trail.length === 0
            ? `No ${noun.many} yet.`
            : "Nothing in this folder yet."}
        </p>
      )}
    </div>
  );
}
