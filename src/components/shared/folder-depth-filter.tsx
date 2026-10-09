"use client";

import { FolderTree } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** How the academy writes a nested folder: `Medical Coding → CPT Quiz`. */
export const PATH_SEPARATOR = " → ";

/** 0 means every level, as deep as the tree goes. */
export type FolderDepth = 0 | 1 | 2 | 3;

export const FOLDER_DEPTH_LABEL: Record<FolderDepth, string> = {
  1: "First level only",
  2: "Two levels",
  3: "Three levels",
  0: "Every level",
};

/**
 * Roll a set of full folder paths up to a depth, merging what falls below.
 *
 * Showing every folder at every level at once is what the academy objected to
 * — "itna ek sath saare folder dekhne me confusion ho jaata hai. Normally
 * first level folder dikhne do." At depth 1, `A → B → C` is listed as `A` and
 * carries everything filed anywhere beneath it, so nothing disappears from the
 * page; it is just gathered where it can be found.
 */
export function rollUpToDepth<T>(
  entries: [string, T[]][],
  depth: FolderDepth,
): [string, T[]][] {
  if (depth === 0) return entries;
  const merged = new Map<string, T[]>();
  for (const [path, items] of entries) {
    const key = path.split(PATH_SEPARATOR).slice(0, depth).join(PATH_SEPARATOR);
    const into = merged.get(key);
    if (!into) {
      merged.set(key, [...items]);
      continue;
    }
    // One item can be filed in two folders that roll up to the same parent.
    for (const item of items) if (!into.includes(item)) into.push(item);
  }
  return [...merged.entries()];
}

/** The deepest any of these paths goes, so the picker offers only real levels. */
export function deepestLevel(paths: string[]): number {
  return paths.reduce(
    (deep, p) => Math.max(deep, p.split(PATH_SEPARATOR).length),
    1,
  );
}

export function FolderDepthFilter({
  value,
  onChange,
  deepest = 3,
}: {
  value: FolderDepth;
  onChange: (depth: FolderDepth) => void;
  deepest?: number;
}) {
  const choices: FolderDepth[] = [1, 2, 3].filter(
    (d) => d <= Math.max(1, deepest),
  ) as FolderDepth[];

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => v && onChange(Number(v) as FolderDepth)}
    >
      <SelectTrigger className="w-auto min-w-44">
        <FolderTree className="text-muted-foreground size-4" />
        <SelectValue>
          {(v) => FOLDER_DEPTH_LABEL[Number(v) as FolderDepth] ?? "Folder levels"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {choices.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {FOLDER_DEPTH_LABEL[d]}
          </SelectItem>
        ))}
        <SelectItem value="0">{FOLDER_DEPTH_LABEL[0]}</SelectItem>
      </SelectContent>
    </Select>
  );
}
