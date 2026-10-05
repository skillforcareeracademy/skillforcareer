"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ICON_NAMES } from "@/config/icons";
import { cn } from "@/lib/utils";
import { ImageUpload } from "@/components/shared/image-upload";
import { isImageIcon } from "@/components/shared/icon-glyph";
import { IconGlyph } from "./icon-glyph";

/**
 * A grid of the glyphs a card may use — or a picture of the academy's own.
 *
 * A grid rather than a dropdown list: the whole catalogue fits in one glance,
 * and the choice is visual — nobody picks an icon by reading
 * "BriefcaseBusiness". Beneath it is the other half of what was asked for:
 * "provide me an option to ads image or icon, anyone from both". Both write the
 * same field, so whatever is chosen last is what the card draws.
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
        <span className="flex min-w-0 items-center gap-2">
          <IconGlyph name={value} className="text-primary size-4 shrink-0" />
          <span className="truncate">
            {isImageIcon(value) ? "Your own image" : value}
          </span>
        </span>
        <ChevronDown className="text-muted-foreground size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] p-2">
        <p className="text-muted-foreground px-1 pb-1.5 text-xs font-medium">
          Pick an icon
        </p>
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
                  <Check
                    className="absolute -top-0.5 -right-0.5 size-3"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* …or a picture instead. Uploading one replaces the glyph outright. */}
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-muted-foreground px-1 text-xs font-medium">
            …or use your own image
          </p>
          <ImageUpload
            value={isImageIcon(value) ? value : ""}
            onChange={(url) => onChange(url || "Sparkles")}
            label="icon image"
            previewClassName="size-10"
          />
          {isImageIcon(value) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange("Sparkles")}
            >
              Go back to an icon
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
