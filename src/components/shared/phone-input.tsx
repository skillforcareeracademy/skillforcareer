"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRIES, parsePhone, type Country } from "@/config/countries";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Phone field with a searchable country-code + flag selector on the left and a
 * number field on the right. Value is a single string like "+91 9876543210";
 * empty when no number is entered.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = "98765 43210",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  // Parse the incoming value once — this component owns the pieces after mount.
  const initial = useMemo(() => parsePhone(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<Country>(initial.country);
  const [national, setNational] = useState(initial.national);
  const [open, setOpen] = useState(false);

  /**
   * cmdk scrolls its selected item into view the moment the list mounts, but
   * Base UI only moves the popup under the trigger a frame *after* it opens.
   * Run in that order and the scroll targets the popup while it still sits at
   * the document origin, dragging the reader to the top of the page — which on
   * the marketing page (`scroll-behavior: smooth`) animates, so it reads as the
   * page navigating away. Mounting the list a frame later lets positioning win.
   */
  const [listMounted, setListMounted] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) requestAnimationFrame(() => setListMounted(true));
    else setListMounted(false);
  }

  function emit(nextCountry: Country, nextNational: string) {
    const digits = nextNational.replace(/[^\d\s-]/g, "").trim();
    onChange(digits ? `${nextCountry.dial} ${digits}` : "");
  }

  function pickCountry(c: Country) {
    setCountry(c);
    handleOpenChange(false);
    emit(c, national);
  }

  function handleNumber(next: string) {
    setNational(next);
    emit(country, next);
  }

  return (
    <div className="flex">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Select country code"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-l-lg border border-r-0 border-input bg-transparent pr-2 pl-2.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
            >
              <span className="text-base leading-none">{country.flag}</span>
              <span className="text-muted-foreground tabular-nums">
                {country.dial}
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 gap-0 p-0">
          <Command
            filter={(val, search) =>
              val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search country or code…" />
            {/* Reserve the height so the popup doesn't resize as the list lands. */}
            <CommandList className="h-64">
              {listMounted && (
                <>
                  <CommandEmpty>No country found.</CommandEmpty>
                  <CommandGroup>
                    {COUNTRIES.map((c) => (
                      <CommandItem
                        key={c.iso2}
                        value={`${c.name} ${c.dial}`}
                        onSelect={() => pickCountry(c)}
                      >
                        <span className="text-base leading-none">{c.flag}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {c.dial}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(e) => handleNumber(e.target.value)}
        placeholder={placeholder}
        className={cn("rounded-l-none focus-visible:z-10")}
      />
    </div>
  );
}
