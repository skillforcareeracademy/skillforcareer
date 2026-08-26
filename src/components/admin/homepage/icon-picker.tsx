"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICON_NAMES } from "@/config/icons";
import { cn } from "@/lib/utils";
import { IconGlyph } from "./icon-glyph";

/**
 * A grid of the glyphs a homepage card may use. A grid rather than a dropdown
 * list: the whole catalogue fits in one glance, and the choice is visual —
 * nobody picks an icon by reading "BriefcaseBusiness".
 */
export function IconPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (name: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="flex items-center gap-2">
          <IconGlyph name={value} className="text-primary size-4" />
          {value}
        </span>
        <ChevronDown className="text-muted-foreground size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] p-2">
        <div className="grid grid-cols-7 gap-1">
          {ICON_NAMES.map((name) => {
            const active = name === value;
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={active}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring relative grid size-9 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2",
                  active && "bg-primary/10 text-primary",
                )}
              >
                <IconGlyph name={name} className="size-4.5" />
                {active && (
                  <Check className="absolute -top-0.5 -right-0.5 size-3" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
