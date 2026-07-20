"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayCircle, Play, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Reel {
  key: string;
  name: string;
  tag: string;
  poster: string;
  video: string;
  duration: string;
  quote?: string;
  rated?: boolean;
}

const V = "https://skillforcareer.in/wp-content/uploads";

/**
 * Real learner reels sourced from the client's live site (skillforcareer.in).
 * Posters are captured frames bundled under /public; the heavy `.mp4` files
 * load only when a reel is opened.
 */
const REELS: Reel[] = [
  {
    key: "arun",
    name: "Arun",
    tag: "SkillForCareer learner",
    poster: "/images/learner-videos/arun.jpg",
    video: `${V}/2026/04/Arun.mp4`,
    duration: "0:15",
    quote:
      "Industry-focused training, real-world projects, and amazing guidance. Highly valuable for career development.",
    rated: true,
  },
  {
    key: "afshah",
    name: "Afshah",
    tag: "Medical Coding student",
    poster: "/images/learner-videos/afshah.jpg",
    video: `${V}/2026/04/afshah.mp4`,
    duration: "0:46",
    quote:
      "Great learning experience with practical exposure and dedicated support. Truly helped me grow professionally.",
    rated: true,
  },
  {
    key: "student-story",
    name: "Student story",
    tag: "In their own words",
    poster: "/images/learner-videos/student-story.jpg",
    video: `${V}/2026/01/testimonials2-1.mp4`,
    duration: "0:26",
  },
  {
    key: "medical-coding",
    name: "Medical Coding",
    tag: "Course spotlight",
    poster: "/images/learner-videos/medical-coding.jpg",
    video: `${V}/2026/01/sfcv3-1.mp4`,
    duration: "0:49",
  },
  {
    key: "reel-1",
    name: "Skill For Career",
    tag: "Career reel",
    poster: "/images/learner-videos/reel-1.jpg",
    video: `${V}/2026/01/sfcv1-1.mp4`,
    duration: "0:34",
  },
  {
    key: "reel-2",
    name: "Skill For Career",
    tag: "Career reel",
    poster: "/images/learner-videos/reel-2.jpg",
    video: `${V}/2026/01/sfcv2-1.mp4`,
    duration: "0:30",
  },
  {
    key: "reel-3",
    name: "Skill For Career",
    tag: "Career reel",
    poster: "/images/learner-videos/reel-3.jpg",
    video: `${V}/2026/01/sfcv4-1.mp4`,
    duration: "0:28",
  },
];

export function LearnerVideos() {
  const [playing, setPlaying] = useState<Reel | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows]);

  function scrollByPage(dir: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-24">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <PlayCircle className="size-4" /> Learner stories
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl">Hear it in their words</h2>
            <p className="text-muted-foreground mt-3">
              Real learners on camera — swipe through and tap any reel to watch.
            </p>
          </div>
          {/* Desktop carousel controls */}
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              aria-label="Previous reels"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              aria-label="More reels"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={updateArrows}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {REELS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setPlaying(r)}
                className="group relative aspect-[9/16] w-[164px] shrink-0 snap-start overflow-hidden rounded-2xl bg-neutral-900 text-left shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-rose-500 sm:w-[190px] lg:w-[210px]"
                aria-label={`Play ${r.name}'s reel`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.poster}
                  alt={r.name}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/25" />

                <span className="absolute top-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur">
                  {r.duration}
                </span>

                <span className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-transform group-hover:scale-110">
                  <Play className="size-5 translate-x-px fill-white text-white" />
                </span>

                <span className="absolute inset-x-0 bottom-0 p-3">
                  {r.rated && (
                    <span className="mb-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className="size-3 fill-amber-400 text-amber-400"
                        />
                      ))}
                    </span>
                  )}
                  <span className="block truncate text-sm font-semibold text-white">
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-white/70">
                    {r.tag}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={playing != null} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="gap-3 p-4 sm:max-w-md sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle>{playing?.name}</DialogTitle>
            <DialogDescription>
              {playing?.quote ? `“${playing.quote}”` : playing?.tag}
            </DialogDescription>
          </DialogHeader>
          {playing && (
            <video
              key={playing.video}
              src={playing.video}
              poster={playing.poster}
              controls
              autoPlay
              playsInline
              preload="none"
              className="mx-auto max-h-[72vh] w-full rounded-lg bg-black object-contain"
            >
              <track kind="captions" />
            </video>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
