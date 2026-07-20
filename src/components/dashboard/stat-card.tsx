import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tint?: string;
  hint?: string;
}

/** Compact metric tile for dashboards. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tint = "from-rose-500 to-pink-600",
  hint,
}: StatCardProps) {
  return (
    <Card className="flex-row items-center gap-4 p-5">
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
          tint,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-tight font-bold">{value}</p>
        <p className="text-muted-foreground truncate text-sm">{label}</p>
        {hint && <p className="text-muted-foreground/70 text-xs">{hint}</p>}
      </div>
    </Card>
  );
}
