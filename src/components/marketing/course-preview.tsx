"use client";

import { useState } from "react";
import { Play, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveEmbed } from "@/lib/media";

/**
 * Course media preview for the detail sidebar: the thumbnail, with a play
 * button that opens the promo video in a dialog when one is available.
 */
export function CoursePreview({
  thumbnailUrl,
  promoVideoUrl,
  title,
}: {
  thumbnailUrl: string | null;
  promoVideoUrl: string | null;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  // Promo videos are usually a YouTube or Drive share link, which a <video>
  // element cannot play — resolve it to the right embed first.
  const embed = resolveEmbed(promoVideoUrl);
  const hasVideo = embed != null && embed.kind !== "link";

  return (
    <>
      <button
        type="button"
        onClick={() => hasVideo && setOpen(true)}
        disabled={!hasVideo}
        aria-label={hasVideo ? "Play course preview" : title}
        className="group relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-rose-500 to-pink-600 outline-none"
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-white/90">
            <BookOpen className="size-10" />
          </span>
        )}

        {hasVideo && (
          <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/35">
            <span className="grid size-14 place-items-center rounded-full bg-white/95 text-rose-600 shadow-lg ring-1 ring-black/5 transition-transform group-hover:scale-110">
              <Play className="ml-0.5 size-6 fill-current" />
            </span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              Preview this course
            </span>
          </span>
        )}
      </button>

      {hasVideo && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="overflow-hidden p-0 sm:max-w-3xl" showCloseButton>
            <DialogHeader className="sr-only">
              <DialogTitle>{title} — preview</DialogTitle>
            </DialogHeader>
            {embed?.kind === "video-file" ? (
              <video
                src={embed.src}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full bg-black"
              />
            ) : (
              <iframe
                src={embed?.src}
                title={`${title} — preview`}
                className="aspect-video w-full bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
