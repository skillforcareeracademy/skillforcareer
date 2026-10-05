"use client";

import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Music,
  PlayCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveEmbed, type Embed, type EmbedKind } from "@/lib/media";
import { cn } from "@/lib/utils";

const ICON: Record<EmbedKind, typeof LinkIcon> = {
  "video-file": PlayCircle,
  "audio-file": Music,
  image: ImageIcon,
  pdf: FileText,
  iframe: FileSpreadsheet,
  link: LinkIcon,
};

/** The embed itself — a player, a picture or a frame, by what the link is. */
function EmbedBody({ embed }: { embed: Embed }) {
  const frame = "h-[70vh] w-full rounded-lg border bg-muted";

  if (embed.kind === "image") {
    return (
      <div className="bg-muted grid max-h-[70vh] place-items-center overflow-auto rounded-lg border p-2">
        {/* A learner's link can point anywhere, so this stays a plain <img>:
            next/image would need every one of those hosts configured. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={embed.src} alt="" className="max-h-[66vh] w-auto rounded" />
      </div>
    );
  }
  if (embed.kind === "audio-file") {
    return (
      <div className="bg-muted/50 rounded-lg border p-6">
        <audio controls src={embed.src} className="w-full">
          Your browser can&apos;t play this file.
        </audio>
      </div>
    );
  }
  if (embed.kind === "video-file") {
    return (
      <video controls src={embed.src} className={cn(frame, "object-contain")}>
        Your browser can&apos;t play this file.
      </video>
    );
  }
  return (
    <iframe
      src={embed.src}
      title="Attached link"
      className={frame}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerPolicy="no-referrer-when-downgrade"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-downloads"
    />
  );
}

/**
 * Opens a link in place rather than throwing the reader out to another tab —
 * "when I open study material link from students panel, it takes me to the
 * google doc. Every Link should open inside app… either it's your tube, doc or
 * excel any link."
 *
 * Anything that can be framed is framed; the "open in a new tab" button stays
 * on screen either way, because a site that refuses to be framed shows nothing
 * and the reader needs a way through.
 */
export function LinkViewer({
  url,
  name,
  children,
  className,
}: {
  url: string;
  /** What to call it in the heading — falls back to the address. */
  name?: string | null;
  /** The trigger. Defaults to the link's name as a button. */
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // `resolveEmbed` only returns null for an empty string, which the callers
  // already guard; the fallback keeps the component total either way.
  const embed =
    resolveEmbed(url) ??
    ({
      kind: "link",
      src: url,
      href: url,
      label: "Link",
      trusted: false,
    } satisfies Embed);
  const Icon = ICON[embed.kind];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("text-left hover:underline", className)}
      >
        {children ?? name ?? url}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"
          // The frame is the point of the dialog, so it gets the room.
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2 pr-6">
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{name || embed.label}</span>
            </DialogTitle>
            <DialogDescription className="truncate">
              {embed.href}
            </DialogDescription>
          </DialogHeader>

          <EmbedBody embed={embed} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {embed.trusted
                ? "Opened inside the app."
                : "Some sites don't allow being shown inside another page. If this stays blank, open it in a new tab."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(embed.href, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="size-4" /> Open in a new tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
