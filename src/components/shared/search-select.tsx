"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchChoice {
  id: string;
  label: string;
  /** A second line to search by and show — an email, a batch, a price. */
  hint?: string;
}

/**
 * Choose one of many, by typing.
 *
 * A plain dropdown works for a dozen rows and falls apart at a thousand:
 * "leaner search krne ka option kyuki zyada learner honge to dikkat hogi".
 * Both the label and the hint are searchable, so a learner can be found by
 * name or by the email the academy has for them.
 *
 * The multi-select cousin of this is `AudiencePicker`.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Choose one",
  searchPlaceholder = "Search…",
  emptyLabel = "Nothing matches that.",
  /** Offered as the first row when the field may be left unset. */
  clearLabel,
  className,
  ariaLabel,
  disabled,
}: {
  options: SearchChoice[];
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  clearLabel?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
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
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            !chosen && "text-muted-foreground",
          )}
        >
          {chosen ? chosen.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem
                  value={clearLabel}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value ? "opacity-0" : "opacity-100",
                    )}
                  />
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  // cmdk matches on this string, so the hint is searchable too:
                  // a learner found by email, a course by its code.
                  value={`${o.label} ${o.hint ?? ""} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === o.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {o.hint}
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
