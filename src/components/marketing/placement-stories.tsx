"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Quote,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HomeData } from "@/lib/validations/homepage";

/** Must match the `gap-6` on the scroll track (1.5rem). */
const CARD_GAP_PX = 24;

export function PlacementStories({ data }: { data: HomeData<"placementStories"> }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  // A mount-only measurement runs before the stylesheet has applied, when the
  // track doesn't overflow yet — that latches "at end" and kills the next
  // arrow. Observing the track re-measures once the real layout lands.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [updateArrows]);

  // Cards tile the track exactly, so a full page is the visible width plus one
  // gap — that lands the next set flush on a card edge instead of mid-card.
  function scrollByPage(dir: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth + CARD_GAP_PX), behavior: "smooth" });
  }

  // After the hooks, never before them — emptying the list in the admin hides
  // the band rather than leaving a heading over blank space.
  if (data.items.length === 0) return null;

  return (
    <section className="container-page py-16 sm:py-24">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {data.badge && (
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <BadgeCheck className="size-4" /> {data.badge}
            </span>
          )}
          <h2 className="mt-4 text-3xl sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="text-muted-foreground mt-3">{data.description}</p>
          )}
        </div>
        {/* Shown on mobile too: touch swipe works, but the arrows make it
            discoverable that there is more than one card. */}
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            aria-label="Previous placement stories"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            aria-label="More placement stories"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateArrows}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {data.items.map((story, i) => (
          <Card
            key={`${story.name}-${i}`}
            // Width is derived from the track so a whole number of cards fits
            // exactly — a fixed px width leaves a sliced card at the right edge.
            // For n across with a 1.5rem gap: (100% - (n-1)*1.5rem) / n.
            className="shrink-0 basis-full snap-start gap-0 overflow-hidden p-0 sm:basis-[calc((100%_-_1.5rem)_/_2)] lg:basis-[calc((100%_-_3rem)_/_3)] xl:basis-[calc((100%_-_4.5rem)_/_4)]"
          >
            <div className="bg-muted relative aspect-[4/5] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={story.photo}
                alt={story.name}
                loading="lazy"
                className="size-full object-cover object-top"
              />
              <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
              {data.placedLabel && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  <BadgeCheck className="size-3.5" /> {data.placedLabel}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, star) => (
                  <Star key={star} className="size-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <Quote className="text-primary/30 mt-3 size-6" aria-hidden />
              <p className="text-foreground/90 mt-1 text-sm leading-relaxed">
                &ldquo;{story.quote}&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{story.name}</p>
                  {story.company && (
                    <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                      <Building2 className="size-3 shrink-0" /> Placed at {story.company}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
