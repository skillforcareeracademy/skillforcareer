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
 */

export interface Grouped {
  categoryName: string | null;
  subCategoryName: string | null;
}

/** Items the academy never filed anywhere still need somewhere to live. */
const UNGROUPED = "Everything else";

const groupOf = (i: Grouped) => i.categoryName?.trim() || UNGROUPED;
const subOf = (i: Grouped) => i.subCategoryName?.trim() || "";

interface Node {
  name: string;
  count: number;
  /** Sub-groups under this one, each with its own count. */
  children: { name: string; count: number }[];
  /** Items filed directly under the group, with no sub-group. */
  direct: number;
}

/** All quizzes › Anatomy › Upper limb — and the way back up. */
function Crumbs({
  many,
  category,
  sub,
  onAll,
  onCategory,
}: {
  many: string;
  category: string | null;
  sub: string | null;
  onAll: () => void;
  onCategory: () => void;
}) {
  return (
    <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={onAll}
        className="hover:text-foreground font-medium"
      >
        All {many}
      </button>
      {category && (
        <>
          <ChevronRight className="size-3.5" />
          <button
            type="button"
            onClick={onCategory}
            className={cn(
              "hover:text-foreground",
              !sub && "text-foreground font-medium",
            )}
          >
            {category}
          </button>
        </>
      )}
      {sub && (
        <>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-medium">{sub}</span>
        </>
      )}
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
  const [category, setCategory] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);

  const tree = useMemo(() => {
    const map = new Map<string, Node>();
    for (const item of items) {
      const name = groupOf(item);
      const node = map.get(name) ?? { name, count: 0, children: [], direct: 0 };
      node.count += 1;
      const child = subOf(item);
      if (child) {
        const found = node.children.find((c) => c.name === child);
        if (found) found.count += 1;
        else node.children.push({ name: child, count: 1 });
      } else {
        node.direct += 1;
      }
      map.set(name, node);
    }
    // The academy's own order is the order the items arrive in; a group takes
    // the place of its first member, and the leftovers always come last.
    return [...map.values()].sort((a, b) =>
      a.name === UNGROUPED ? 1 : b.name === UNGROUPED ? -1 : 0,
    );
  }, [items]);

  const searching = Boolean(query && query.trim());

  const shown = useMemo(() => {
    if (searching) return items;
    if (!category) return [];
    const inGroup = items.filter((i) => groupOf(i) === category);
    if (sub) return inGroup.filter((i) => subOf(i) === sub);
    // Inside a group with sub-groups, only what was filed directly under it;
    // the rest is one more tap away.
    const node = tree.find((n) => n.name === category);
    return node && node.children.length > 0
      ? inGroup.filter((i) => !subOf(i))
      : inGroup;
  }, [items, category, sub, searching, tree]);

  const node = tree.find((n) => n.name === category) ?? null;

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
        category={category}
        sub={sub}
        onAll={() => {
          setCategory(null);
          setSub(null);
        }}
        onCategory={() => setSub(null)}
      />

      {!category && (
        <div className={cn("grid gap-3", columns)}>
          {tree.map((g) => (
            <GroupCard
              key={g.name}
              name={g.name}
              count={g.count}
              noun={noun}
              icon={Layers}
              onOpen={() => {
                setCategory(g.name);
                setSub(null);
              }}
            />
          ))}
        </div>
      )}

      {category && !sub && node && node.children.length > 0 && (
        <div className={cn("grid gap-3", columns)}>
          {node.children.map((c) => (
            <GroupCard
              key={c.name}
              name={c.name}
              count={c.count}
              noun={noun}
              icon={FolderOpen}
              onOpen={() => setSub(c.name)}
            />
          ))}
        </div>
      )}

      {category && shown.length > 0 && (
        <div className={cn("grid gap-4", columns)}>
          {shown.map((i) => renderItem(i))}
        </div>
      )}

      {category && shown.length === 0 && node && node.children.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Nothing in this group yet.
        </p>
      )}
    </div>
  );
}
