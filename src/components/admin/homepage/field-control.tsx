"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/shared/image-upload";
import { TINTS, TINT_NAMES, TONES, TONE_NAMES } from "@/config/icons";
import type { Field } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";
import { IconPicker } from "./icon-picker";

/**
 * One editable value, drawn from its field spec. Every homepage form is built
 * out of these, so a section gains a field by being described — not coded.
 */
export function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const asText = typeof value === "string" ? value : "";

  if (field.type === "switch") {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor={id}>{field.label}</Label>
          {field.hint && <p className="text-muted-foreground text-xs">{field.hint}</p>}
        </div>
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={(next) => onChange(next)}
          className="mt-0.5"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>

      {field.type === "textarea" && (
        <Textarea
          id={id}
          rows={3}
          value={asText}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {(field.type === "text" || field.type === "url") && (
        <Input
          id={id}
          value={asText}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "number" && (
        <Input
          id={id}
          type="number"
          min={1}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            // Keep the box usable while it is being retyped — an empty string
            // would otherwise snap straight back to a number.
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) && next > 0 ? next : "");
          }}
        />
      )}

      {field.type === "image" && (
        <div className="space-y-2">
          <ImageUpload value={asText} onChange={onChange} label="photo" />
          {/* Pasting is a first-class path here: a lot of this content already
              lives on the old site, and re-uploading every headshot to change
              one caption would be busywork. */}
          <Input
            id={id}
            value={asText}
            placeholder="…or paste an image URL"
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      )}

      {field.type === "select" && (
        <Select value={asText} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choose one">
              {(v) =>
                (field.options ?? []).find((o) => o.value === v)?.label ?? "Choose one"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "icon" && (
        <IconPicker id={id} value={asText} onChange={onChange} />
      )}

      {field.type === "tint" && (
        <Select value={asText} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            {/* Without a render prop the trigger shows the stored key — "rose"
                rather than "Rose" — so the chosen colour has to be spelled out. */}
            <SelectValue placeholder="Pick a colour">
              {(v) => {
                const name = TINT_NAMES.find((n) => n === v);
                if (!name) return "Pick a colour";
                return (
                  <>
                    <span
                      className={cn(
                        "size-4 rounded-full bg-gradient-to-br",
                        TINTS[name].gradient,
                      )}
                      aria-hidden
                    />
                    {TINTS[name].label}
                  </>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TINT_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                <span
                  className={cn(
                    "size-4 rounded-full bg-gradient-to-br",
                    TINTS[name].gradient,
                  )}
                  aria-hidden
                />
                {TINTS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "tone" && (
        <Select value={asText} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Pick a colour">
              {(v) => {
                const name = TONE_NAMES.find((n) => n === v);
                if (!name) return "Pick a colour";
                return (
                  <>
                    <span
                      className={cn("size-3 rounded-full bg-current", TONES[name].className)}
                      aria-hidden
                    />
                    {TONES[name].label}
                  </>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TONE_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                <span
                  className={cn("size-3 rounded-full bg-current", TONES[name].className)}
                  aria-hidden
                />
                {TONES[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.hint && <p className="text-muted-foreground text-xs">{field.hint}</p>}
    </div>
  );
}
