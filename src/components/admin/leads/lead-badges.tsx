import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
  LEAD_SOURCE_LABELS,
  LEAD_CLASS_MODE_LABELS,
  LEAD_QUALITY_LABELS,
  LEAD_QUALITY_COLORS,
  type LeadStage,
  type LeadSource,
  type LeadClassMode,
  type LeadQuality,
} from "@/lib/validations/lead";
import { cn } from "@/lib/utils";

/**
 * The nine stages carry the client's own hex codes. Rather than hand-write
 * eighteen Tailwind classes that only approximate them, the badge tints itself
 * from the hex with `color-mix` — exact in light mode, readable in dark.
 */
export function STAGE_BADGE(stage: string, className?: string): ReactNode {
  const hex = LEAD_STAGE_COLORS[stage as LeadStage];
  const label = LEAD_STAGE_LABELS[stage as LeadStage] ?? stage;

  if (!hex) {
    return (
      <Badge variant="secondary" className={className}>
        {label}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn("gap-1.5 border-transparent whitespace-nowrap", className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`,
        color: `color-mix(in srgb, ${hex} 80%, var(--foreground))`,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {label}
    </Badge>
  );
}

/** The sub-status reads as a quieter companion to the stage badge. */
export function SUB_STATUS_BADGE(subStatus: string | null): ReactNode {
  if (!subStatus) return null;
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground font-normal whitespace-nowrap"
    >
      {subStatus}
    </Badge>
  );
}

/** Hot / Warm / Cold / Not sure, tinted the same way as the stage badge. */
export function QUALITY_BADGE(quality: string | null): ReactNode {
  if (!quality) return null;
  const hex = LEAD_QUALITY_COLORS[quality as LeadQuality];
  const label = LEAD_QUALITY_LABELS[quality as LeadQuality] ?? quality;
  if (!hex) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="border-transparent whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`,
        color: `color-mix(in srgb, ${hex} 80%, var(--foreground))`,
      }}
    >
      {label}
    </Badge>
  );
}

export function SOURCE_LABEL(source: string): string {
  return LEAD_SOURCE_LABELS[source as LeadSource] ?? source;
}

export function CLASS_MODE_LABEL(mode: string | null): string {
  if (!mode) return "—";
  return LEAD_CLASS_MODE_LABELS[mode as LeadClassMode] ?? mode;
}
