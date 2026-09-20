import { Badge } from "@/components/ui/badge";
import {
  CANDIDATE_STATUS_COLORS,
  CANDIDATE_STATUS_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  type CandidateStatus,
  type ExperienceLevel,
} from "@/lib/validations/careers";
import { cn } from "@/lib/utils";

/** Tinted from the status hex, the same way the lead stages are. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const hex = CANDIDATE_STATUS_COLORS[status as CandidateStatus] ?? "#71717A";
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1.5 border-transparent whitespace-nowrap", className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`,
        color: `color-mix(in srgb, ${hex} 80%, var(--foreground))`,
      }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      {CANDIDATE_STATUS_LABELS[status as CandidateStatus] ?? status}
    </Badge>
  );
}

export function LevelBadge({ level, className }: { level: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        level === "EXPERIENCED"
          ? "border-violet-500/30 text-violet-700 dark:text-violet-400"
          : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {EXPERIENCE_LEVEL_LABELS[level as ExperienceLevel] ?? level}
    </Badge>
  );
}
