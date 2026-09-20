"use client";

import { useState } from "react";
import {
  CalendarClock,
  CalendarX,
  Flame,
  Inbox,
  LayoutGrid,
  MapPin,
  Sparkles,
  Target,
  ThumbsUp,
  TrendingUp,
  UserCheck,
  UserRound,
  UserX,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_STAT_CARDS,
  LEAD_STAT_CARD_HINTS,
  LEAD_STAT_CARD_LABELS,
  DEFAULT_LEAD_STAT_CARDS,
  type LeadStatCard,
} from "@/lib/validations/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

const CARD_LOOK: Record<LeadStatCard, { icon: LucideIcon; tone: string }> = {
  total: { icon: Target, tone: "text-rose-500" },
  fresh: { icon: Sparkles, tone: "text-sky-500" },
  inProgress: { icon: UserCheck, tone: "text-amber-500" },
  interested: { icon: ThumbsUp, tone: "text-pink-500" },
  converted: { icon: TrendingUp, tone: "text-emerald-500" },
  notInterested: { icon: XCircle, tone: "text-muted-foreground" },
  followUpsToday: { icon: CalendarClock, tone: "text-indigo-500" },
  overdue: { icon: CalendarX, tone: "text-red-500" },
  visitsToday: { icon: MapPin, tone: "text-orange-500" },
  hot: { icon: Flame, tone: "text-red-500" },
  unassigned: { icon: UserX, tone: "text-slate-500" },
  mine: { icon: UserRound, tone: "text-primary" },
  receivedThisWeek: { icon: Inbox, tone: "text-violet-500" },
};

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The boxes above the lead list. Each counsellor picks their own set from
 * "Customize cards"; ticking previews straight away and the choice is saved
 * once, when the menu closes, rather than on every tick.
 */
export function LeadStatCards({
  stats,
  cards: initial,
}: {
  stats: Record<LeadStatCard, number>;
  cards: LeadStatCard[];
}) {
  const [cards, setCards] = useState<LeadStatCard[]>(initial);
  const [saved, setSaved] = useState<LeadStatCard[]>(initial);

  function toggle(card: LeadStatCard, on: boolean) {
    setCards((current) =>
      LEAD_STAT_CARDS.filter((c) => (c === card ? on : current.includes(c))),
    );
  }

  async function persist() {
    if (same(cards, saved)) return;
    const next = cards;
    try {
      await api.patch("/api/leads/preferences", { cards: next });
      setSaved(next);
    } catch (err) {
      setCards(saved);
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save your cards.",
      );
    }
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4">
      {cards.map((key) => {
        const { icon: Icon, tone } = CARD_LOOK[key];
        return (
          <Card key={key} title={LEAD_STAT_CARD_HINTS[key]}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <Icon className={`size-5 ${tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl leading-none font-semibold tabular-nums">
                  {stats[key]}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">
                  {LEAD_STAT_CARD_LABELS[key]}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Popover
        onOpenChange={(open) => {
          if (!open) void persist();
        }}
      >
        <PopoverTrigger className="border-muted-foreground/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:ring-ring/50 flex min-h-18 items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-sm transition-colors outline-none focus-visible:ring-2">
          <LayoutGrid className="size-4" />
          Customize cards
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Cards on your lead page</PopoverTitle>
            <PopoverDescription>
              Pick the boxes you want to see. Only you see this choice.
            </PopoverDescription>
          </PopoverHeader>
          <div className="-mx-1 max-h-[55vh] overflow-y-auto">
            {LEAD_STAT_CARDS.map((key) => {
              const { icon: Icon, tone } = CARD_LOOK[key];
              return (
                <label
                  key={key}
                  className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={cards.includes(key)}
                    onCheckedChange={(checked) => toggle(key, checked)}
                  />
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {LEAD_STAT_CARD_LABELS[key]}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {stats[key]}
                      </span>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {LEAD_STAT_CARD_HINTS[key]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-between border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCards([...DEFAULT_LEAD_STAT_CARDS])}
            >
              Reset to default
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCards([...LEAD_STAT_CARDS])}
            >
              Show all
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
