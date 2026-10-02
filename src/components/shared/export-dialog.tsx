"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Columns3, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Choosing what to download, rather than always taking everything.
 *
 * "Create a separate option for export where i can select what to download and
 * what not. As per date wise or folder wise or a single file or course wise or
 * with all columns." Narrowing and column-picking are the same job wherever
 * they appear, so the dialog is shared: a caller says which scopes it has and
 * which columns exist, and gets both the data export and the blank sample
 * sheet — the sheet carries exactly the columns ticked here, which is what
 * makes it a sheet you can fill in and import straight back.
 */

export interface ExportColumn {
  key: string;
  label: string;
}

/** One "narrow it by…" dropdown: a query parameter and what can go in it. */
export interface ExportScope {
  key: string;
  label: string;
  anyLabel: string;
  options: { value: string; label: string }[];
}

const ANY = "__any";

export function ExportDialog({
  open,
  onOpenChange,
  title,
  description,
  endpoint,
  columns,
  defaultColumns,
  scopes = [],
  /** Extra parameters that are always sent, e.g. a search already typed. */
  fixedParams,
  /** Off where a blank sheet makes no sense. */
  sampleSheet = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  endpoint: string;
  columns: ExportColumn[];
  defaultColumns: string[];
  scopes?: ExportScope[];
  fixedParams?: Record<string, string | undefined>;
  sampleSheet?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(defaultColumns);
  const [scopeValues, setScopeValues] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const allOn = picked.length === columns.length;

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (picked.length > 0) qs.set("columns", picked.join(","));
    for (const [key, value] of Object.entries(scopeValues)) {
      if (value && value !== ANY) qs.set(key, value);
    }
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    for (const [key, value] of Object.entries(fixedParams ?? {})) {
      if (value) qs.set(key, value);
    }
    return `${endpoint}?${qs.toString()}`;
  }, [endpoint, picked, scopeValues, from, to, fixedParams]);

  function toggle(key: string) {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {scopes.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {scopes.map((scope) => (
                <div key={scope.key} className="space-y-1.5">
                  <Label>{scope.label}</Label>
                  <Select
                    value={scopeValues[scope.key] ?? ANY}
                    onValueChange={(v) =>
                      setScopeValues((s) => ({ ...s, [scope.key]: v ?? ANY }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ANY
                            ? scope.anyLabel
                            : (scope.options.find((o) => o.value === v)?.label ??
                              scope.anyLabel)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{scope.anyLabel}</SelectItem>
                      {scope.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> Added between
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Leave both empty for everything, whenever it was added.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Columns3 className="size-3.5" /> Columns
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setPicked(allOn ? [] : columns.map((c) => c.key))
                }
              >
                {allOn ? "Clear all" : "Select all"}
              </Button>
            </div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
              {columns.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={picked.includes(c.key)}
                    onCheckedChange={() => toggle(c.key)}
                  />
                  <span className="truncate">{c.label}</span>
                </label>
              ))}
            </div>
            {picked.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Nothing ticked — the usual columns will be used.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {sampleSheet ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={`${url}&sample=1`} download />}
            >
              <FileSpreadsheet className="size-4" /> Blank sample sheet
            </Button>
          ) : (
            <span />
          )}
          <Button nativeButton={false} render={<a href={url} download />}>
            <Download className="size-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
