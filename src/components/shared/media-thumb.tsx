"use client";

import { useState } from "react";
import Image from "next/image";
import { FileText, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A library tile's picture.
 *
 * Files can outlive their bytes — an install that started on the `db` storage
 * driver and later moved to `local` or `s3` still has the catalogue rows, and
 * the object is simply not where this deployment looks. Left to the browser
 * that renders as the alt text sprawling across the tile, which reads as a
 * broken page rather than a missing file, so a failed load falls back to a
 * plain marker instead.
 */
export function MediaThumb({
  url,
  name,
  alt,
  isImage,
  sizes,
  className,
}: {
  url: string;
  name: string;
  alt?: string | null;
  isImage: boolean;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!isImage || failed) {
    return (
      <span
        className={cn(
          "text-muted-foreground grid h-full place-items-center gap-1 text-center",
          className,
        )}
        title={failed ? `${name} — file not found in storage` : name}
      >
        {failed ? <ImageOff className="size-6" /> : <FileText className="size-6" />}
        {failed && <span className="text-[10px]">Missing file</span>}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt={alt ?? ""}
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
