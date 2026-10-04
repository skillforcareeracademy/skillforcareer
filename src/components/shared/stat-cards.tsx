"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The figures above a list, and the filter behind each one.
 *
 * "Clickable hone chahiye ye har jagha." A card that says 5 Drafts and does
 * nothing when tapped is a dead end: the number is the question, and the list
 * below is the answer. Tapping one narrows the list to exactly what it counts,
 * and tapping it again clears that — so the card is also how you get back.
 *
 * Shared so every panel behaves the same way. A card with no `onClick` still
 * renders, just as a plain figure: some numbers (money taken, say) have no list
 * to narrow to, and a card that looks tappable but isn't is worse than one that
 * plainly isn't.
 */

export interface StatCard {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** A colour for the icon, e.g. "text-emerald-500". */
  tone?: string;
  /** Hover text — what the card counts, where the label has to be short. */
  hint?: string;
  /** What tapping it does. Omitted leaves the card as a plain figure. */
  onClick?: () => void;
  /** Or where it leads, when the answer is on another page. */
  href?: string;
  /** True when the list already reads this way; the card shows as pressed. */
  active?: boolean;
}

export function StatCards({
  cards,
  className = "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4",
}: {
  cards: StatCard[];
  className?: string;
}) {
  return (
    <div className={className}>
      {cards.map((s) => {
        const body = (
          <CardContent className="flex items-center gap-3 py-4">
            <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
              <s.icon className={cn("size-5", s.tone)} />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-2xl leading-none font-semibold tabular-nums">
                {typeof s.value === "number"
                  ? s.value.toLocaleString("en-IN")
                  : s.value}
              </p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {s.label}
              </p>
            </div>
          </CardContent>
        );

        return (
          <Card
            key={s.label}
            title={s.hint}
            className={cn(
              (s.onClick || s.href) && "hover:border-primary/40 transition-colors",
              s.active && "border-primary ring-primary/25 ring-1",
            )}
          >
            {s.href ? (
              <Link
                href={s.href}
                className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-2"
              >
                {body}
              </Link>
            ) : s.onClick ? (
              <button
                type="button"
                onClick={s.onClick}
                aria-pressed={s.active ?? false}
                className="focus-visible:ring-ring/50 block w-full cursor-pointer rounded-xl outline-none focus-visible:ring-2"
              >
                {body}
              </button>
            ) : (
              body
            )}
          </Card>
        );
      })}
    </div>
  );
}
