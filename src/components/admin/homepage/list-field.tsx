"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isListField, type Field, type ListField } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";
import { FieldControl } from "./field-control";
import { IconGlyph } from "./icon-glyph";

type Item = Record<string, unknown>;

/** A new row with every sub-field at a sensible starting value. */
function blankItem(fields: (Field | ListField)[]): Item {
  const item: Item = {};
  for (const field of fields) {
    if (isListField(field)) item[field.name] = [];
    else if (field.type === "switch") item[field.name] = false;
    else if (field.type === "number") item[field.name] = 1;
    else if (field.type === "icon") item[field.name] = "Sparkles";
    else if (field.type === "tint" || field.type === "tone") item[field.name] = "rose";
    else if (field.type === "select") item[field.name] = field.options?.[0]?.value ?? "";
    else item[field.name] = "";
  }
  return item;
}

/** What a collapsed row shows — its title field, or a fallback. */
function rowTitle(item: Item, spec: ListField, index: number): string {
  const raw = item[spec.titleKey];
  const title = typeof raw === "string" ? raw.trim() : "";
  return title || `${spec.itemLabel} ${index + 1}`;
}

export function ListFieldEditor({
  spec,
  value,
  onChange,
}: {
  spec: ListField;
  value: unknown;
  onChange: (value: Item[]) => void;
}) {
  const items: Item[] = Array.isArray(value) ? (value as Item[]) : [];
  // Short lists open flat — expanding three cards to write three lines is
  // friction. Long ones stay collapsed so the whole list is scannable.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(items.length <= 3 ? items.map((_, i) => i) : []),
  );

  function replace(next: Item[], reopen?: Set<number>) {
    onChange(next);
    if (reopen) setOpen(reopen);
  }

  function toggle(index: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setField(index: number, name: string, fieldValue: unknown) {
    replace(items.map((item, i) => (i === index ? { ...item, [name]: fieldValue } : item)));
  }

  function add() {
    replace([...items, blankItem(spec.fields)], new Set([...open, items.length]));
  }

  function remove(index: number) {
    // Indices shift, so the open set has to shift with them or the wrong rows
    // spring open after a delete.
    const reopen = new Set<number>();
    for (const i of open) {
      if (i < index) reopen.add(i);
      else if (i > index) reopen.add(i - 1);
    }
    replace(
      items.filter((_, i) => i !== index),
      reopen,
    );
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];

    const reopen = new Set(open);
    const wasOpen = open.has(index);
    const targetOpen = open.has(target);
    reopen.delete(index);
    reopen.delete(target);
    if (wasOpen) reopen.add(target);
    if (targetOpen) reopen.add(index);
    replace(next, reopen);
  }

  const full = items.length >= spec.max;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Label>{spec.label}</Label>
          {spec.hint && <p className="text-muted-foreground mt-0.5 text-xs">{spec.hint}</p>}
        </div>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {items.length} / {spec.max}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => {
          const expanded = open.has(index);
          const glyph = typeof item.icon === "string" ? item.icon : null;
          return (
            <div key={index} className="bg-card overflow-hidden rounded-lg border">
              <div className="flex items-center gap-1 pr-1.5">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={expanded}
                  className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors"
                >
                  <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  {glyph && (
                    <IconGlyph name={glyph} className="text-primary size-4 shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium">
                    {rowTitle(item, spec, index)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground ml-auto size-4 shrink-0 transition-transform",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${spec.itemLabel} up`}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${spec.itemLabel} down`}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${spec.itemLabel}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {expanded && (
                <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                  {spec.fields.map((field) =>
                    // A row can itself hold a list — a footer column holds its
                    // links — so the editor draws itself again one level down.
                    isListField(field) ? (
                      <div key={field.name} className="bg-muted/30 rounded-lg p-3 sm:col-span-2">
                        <ListFieldEditor
                          spec={field}
                          value={item[field.name]}
                          onChange={(next) => setField(index, field.name, next)}
                        />
                      </div>
                    ) : (
                      <div key={field.name} className={cn(field.wide && "sm:col-span-2")}>
                        <FieldControl
                          field={field}
                          value={item[field.name]}
                          onChange={(next) => setField(index, field.name, next)}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={full}>
        <Plus className="size-4" /> Add {spec.itemLabel}
      </Button>
      {full && (
        <p className="text-muted-foreground text-xs">
          That&apos;s the maximum this section can show.
        </p>
      )}
    </div>
  );
}
