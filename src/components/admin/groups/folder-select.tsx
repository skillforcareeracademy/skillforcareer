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
 * useless for sixty, so this one filters as you type and shows each folder's
 * full path — "Medical Coding → MC Basics → Week 1" — rather than a bare name
 * that could belong anywhere in the tree.
 */
export interface FolderChoice {
  id: string;
  /** The full path, which is what a person searches by. */
  path: string;
  depth: number;
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
        <span className="min-w-0 flex-1 truncate text-left">
          {chosen ? chosen.path : topLabel}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
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
                  <span className="min-w-0 flex-1 truncate">{o.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
