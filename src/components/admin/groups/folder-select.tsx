"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Choose one folder, by typing.
 *
 * "Isme level me search ka option bhi do kyuki zyada folder ho jayenge to
 * search nhi kr paunga dekh kr." A plain dropdown is fine for six folders and
 * useless for sixty, so this one filters as you type. Each folder is shown by
 * its own name with the branch it sits in beneath, because one truncated line
 * of "Medical Coding → CPT Quiz → …" reads the same for every folder in that
 * branch. Searching still matches on the whole path.
 */
export interface FolderChoice {
  id: string;
  /** The full path, which is what a person searches by. */
  path: string;
  depth: number;
}

/** "A → B → C" → "C". */
function leafOf(path: string): string {
  const parts = path.split(" → ");
  return parts[parts.length - 1] ?? path;
}

/** "A → B → C" → "A → B"; empty for a top-level folder. */
function trailOf(path: string): string {
  const parts = path.split(" → ");
  return parts.slice(0, -1).join(" → ");
}

export function FolderSelect({
  options,
  value,
  onChange,
  /** What "nothing chosen" is called here. */
  topLabel = "Top level",
  placeholder = "Search folders…",
  className,
  ariaLabel,
}: {
  options: FolderChoice[];
  value: string | null;
  onChange: (next: string | null) => void;
  topLabel?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className={cn("justify-between font-normal", className)}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left" title={chosen?.path}>
          {/* The last segment, not the whole path: a trigger this narrow cuts
              "Medical Coding → CPT Quiz → Fundamentals" down to
              "Medical Coding → CPT Q…", which reads the same for every folder
              in that branch. The full path is in the tooltip and in the list. */}
          {chosen ? leafOf(chosen.path) : topLabel}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No folder matches that.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={topLabel}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                {topLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  // cmdk filters on this, so the whole path is searchable —
                  // typing "upper" finds "Anatomy → Upper limb".
                  value={`${o.path} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", value === o.id ? "opacity-100" : "opacity-0")}
                  />
                  <FolderTree className="text-muted-foreground size-3.5 shrink-0" />
                  {/* The folder's own name on top, where it is read, and the
                      branch it sits in beneath — rather than one truncated
                      line that makes every deep folder look alike. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{leafOf(o.path)}</span>
                    {trailOf(o.path) && (
                      <span className="text-muted-foreground block truncate text-xs">
                        in {trailOf(o.path)}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
