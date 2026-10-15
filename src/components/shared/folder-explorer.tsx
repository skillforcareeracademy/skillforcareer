"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, FolderOpen, GripVertical, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PATH_SEPARATOR, type FolderDepth } from "./folder-depth-filter";

/**
 * The academy's own shelves, opened one at a time.
 *
 * "When I open this folder, first the sub-folder, then the folder inside it,
 * then the file." The admin panels used to pour every item filed anywhere
 * beneath a folder into one flat list the moment it was opened; this walks the
 * tree the way the learner's side already does — folders first, then what is
 * filed in the folder you are actually standing in, as deep as the academy
 * nested them.
 *
 * The folder-levels filter is kept, and still means what it did: a cap of `n`
 * rolls every path up to `n` segments, so beyond it nothing nests further and
 * the deeper items gather in the folder at the cap. Zero is the whole tree.
 *
 * Items drag to reorder within the folder they sit in; the new order of that
 * one folder's ids goes back through `onReorder`.
 */

const UNGROUPED = "Ungrouped";

export interface FolderExplorerProps<T> {
  items: T[];
  /** The full folder path(s) an item is filed under — it may be in several. */
  getPaths: (item: T) => string[][];
  keyOf: (item: T) => string;
  /** The row's own content; the explorer adds the drag handle beside it. */
  renderItem: (item: T) => ReactNode;
  /** Roll-up cap from the folder-levels filter. 0 / undefined = every level. */
  depth?: FolderDepth;
  /** A live search; when set the folders step aside and every match is listed. */
  query?: string;
  /** The ids of one folder in their new order. Omit to switch dragging off. */
  onReorder?: (ids: string[]) => void | Promise<void>;
  noun?: { one: string; many: string };
  emptyLabel?: string;
}

/** Split a stored path string (`A → B → C`) into trimmed segments. */
export function segmentsOf(path: string): string[] {
  const parts = path
    .split(PATH_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [UNGROUPED];
}

/** Cap a path at `depth` segments; 0 keeps the whole thing. */
function capped(path: string[], depth: number): string[] {
  return depth > 0 ? path.slice(0, depth) : path;
}

const startsWith = (path: string[], trail: string[]) =>
  trail.every((seg, i) => path[i] === seg);

const samePath = (a: string[], b: string[]) =>
  a.length === b.length && a.every((seg, i) => seg === b[i]);

export function FolderExplorer<T>({
  items,
  getPaths,
  keyOf,
  renderItem,
  depth = 0,
  query,
  onReorder,
  noun = { one: "item", many: "items" },
  emptyLabel,
}: FolderExplorerProps<T>) {
  const [trail, setTrail] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // The source also lives in a ref: a drop reads it synchronously, without
  // waiting for the dragstart state update to commit first.
  const dragKeyRef = useRef<string | null>(null);

  /** Each item with the (capped, de-duplicated) paths it is filed under. */
  const filed = useMemo(() => {
    return items.map((item) => {
      const raw = getPaths(item).filter((p) => p.length > 0);
      const source = raw.length ? raw : [[UNGROUPED]];
      const seen = new Set<string>();
      const paths: string[][] = [];
      for (const p of source) {
        const c = capped(p, depth);
        const k = c.join(PATH_SEPARATOR);
        if (!seen.has(k)) {
          seen.add(k);
          paths.push(c);
        }
      }
      return { item, paths };
    });
  }, [items, getPaths, depth]);

  /** Folders directly inside the trail, each counting all below it. */
  const children = useMemo(() => {
    const found = new Map<string, number>();
    for (const { paths } of filed) {
      for (const path of paths) {
        if (path.length <= trail.length || !startsWith(path, trail)) continue;
        const name = path[trail.length]!;
        found.set(name, (found.get(name) ?? 0) + 1);
      }
    }
    return [...found.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) =>
        a.name === UNGROUPED ? 1 : b.name === UNGROUPED ? -1 : 0,
      );
  }, [filed, trail]);

  /** What is filed in this exact folder, not in one below it. */
  const here = useMemo(
    () => filed.filter(({ paths }) => paths.some((p) => samePath(p, trail))),
    [filed, trail],
  );

  const searching = Boolean(query && query.trim());

  if (searching) {
    return (
      <div className="divide-y rounded-xl border">
        {items.map((item) => (
          <div key={keyOf(item)} className="px-1">
            {renderItem(item)}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {emptyLabel ?? "Nothing matches those filters."}
          </p>
        )}
      </div>
    );
  }

  async function drop(targetKey: string) {
    const source = dragKeyRef.current ?? dragKey;
    if (!onReorder || !source || source === targetKey) {
      dragKeyRef.current = null;
      setDragKey(null);
      setOverKey(null);
      return;
    }
    const ids = here.map(({ item }) => keyOf(item));
    const from = ids.indexOf(source);
    const to = ids.indexOf(targetKey);
    dragKeyRef.current = null;
    setDragKey(null);
    setOverKey(null);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    await onReorder(next);
  }

  return (
    <div className="space-y-3">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setTrail([])}
          className="hover:text-foreground font-medium"
        >
          All {noun.many}
        </button>
        {trail.map((name, i) => (
          <span key={`${i}-${name}`} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" />
            <button
              type="button"
              onClick={() => setTrail((t) => t.slice(0, i + 1))}
              className={cn(
                "hover:text-foreground",
                i === trail.length - 1 && "text-foreground font-medium",
              )}
            >
              {name}
            </button>
          </span>
        ))}
      </nav>

      {children.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setTrail((t) => [...t, c.name])}
              className="hover:border-primary/60 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors"
            >
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                {trail.length === 0 ? (
                  <Layers className="text-muted-foreground size-4" />
                ) : (
                  <FolderOpen className="text-muted-foreground size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {c.name}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {c.count} {c.count === 1 ? noun.one : noun.many}
                </span>
              </span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {here.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {here.map(({ item }) => {
            const key = keyOf(item);
            return (
              <li
                key={key}
                draggable={Boolean(onReorder)}
                onDragStart={() => {
                  dragKeyRef.current = key;
                  setDragKey(key);
                }}
                onDragEnd={() => {
                  dragKeyRef.current = null;
                  setDragKey(null);
                  setOverKey(null);
                }}
                onDragOver={(e) => {
                  if (!onReorder || !dragKey) return;
                  e.preventDefault();
                  if (overKey !== key) setOverKey(key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop(key);
                }}
                className={cn(
                  "flex items-center gap-1",
                  dragKey === key && "opacity-50",
                  overKey === key &&
                    dragKey &&
                    dragKey !== key &&
                    "border-primary border-t-2",
                )}
              >
                {onReorder && (
                  <span
                    className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab pl-2 active:cursor-grabbing"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">{renderItem(item)}</div>
              </li>
            );
          })}
        </ul>
      )}

      {children.length === 0 && here.length === 0 && (
        <p className="text-muted-foreground rounded-xl border p-6 text-center text-sm">
          {trail.length === 0
            ? (emptyLabel ?? `No ${noun.many} yet.`)
            : "Nothing in this folder yet."}
        </p>
      )}
    </div>
  );
}

/** A tiny count badge some callers want in their folder rows. */
export function FolderCount({ n }: { n: number }) {
  return (
    <Badge variant="secondary" className="shrink-0 text-[10px]">
      {n}
    </Badge>
  );
}
