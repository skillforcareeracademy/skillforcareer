import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tint?: string;
  hint?: string;
  /** Where the figure leads — the list it is counting. */
  href?: string;
  /** True when the list already reads this way; the tile shows as pressed. */
  active?: boolean;
}

/**
 * Compact metric tile for dashboards.
 *
 * "Clickable hone chahiye ye har jagha" — a figure is a question, and the tile
 * is how you get to the answer. Given a `href` it becomes a link; without one
 * it stays a plain figure, because a tile that looks tappable and isn't is
 * worse than one that plainly isn't.
 *
 * Deliberately **not** a client component: the dashboards that render these are
 * server components and pass `icon` as a component, which cannot cross a client
 * boundary. Where a figure needs an `onClick` rather than a link, the page is a
 * client component already and uses `components/shared/stat-cards` instead.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tint = "from-rose-500 to-pink-600",
  hint,
  href,
  active,
}: StatCardProps) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
          tint,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 text-left">
        <p className="text-2xl leading-tight font-bold">{value}</p>
        <p className="text-muted-foreground truncate text-sm">{label}</p>
        {hint && <p className="text-muted-foreground/70 text-xs">{hint}</p>}
      </div>
    </>
  );

  const interactive = Boolean(href);
  const inner = "flex w-full flex-row items-center gap-4 p-5 text-left";

  return (
    <Card
      className={cn(
        "flex-row items-center gap-4",
        interactive ? "hover:border-primary/40 p-0 transition-colors" : "p-5",
        active && "border-primary ring-primary/25 ring-1",
      )}
    >
      {href ? (
        <Link
          href={href}
          className={cn(inner, "focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-2")}
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
