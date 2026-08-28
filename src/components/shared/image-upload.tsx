"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ImageIcon, Library, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./media-picker";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Generic image uploader with a rectangular preview — used for the site logo,
 * the favicon and every image field in the homepage editor. Posts to
 * /api/upload and hands the stored URL back via onChange.
 *
 * "Library" opens the media picker, so a photo that was uploaded once for one
 * section can be reused in another without being uploaded again. Every upload
 * from here is catalogued there too.
 */
export function ImageUpload({
  value,
  onChange,
  label = "image",
  className,
  previewClassName,
  showLibrary = true,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
  previewClassName?: string;
  /** Off for pickers outside the admin, where /api/media isn't readable. */
  showLibrary?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Upload failed.");
      }
      onChange(json.data.url as string);
      toast.success(`${label[0].toUpperCase() + label.slice(1)} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={`Upload ${label}`}
        className={cn(
          "bg-muted/40 relative grid size-16 place-items-center overflow-hidden rounded-lg border border-dashed border-input outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          previewClassName,
        )}
      >
        {value ? (
          <Image
            src={value}
            alt={label}
            fill
            sizes="64px"
            className="object-contain p-1.5"
            unoptimized
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
        {uploading && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-white">
            <Loader2 className="size-5 animate-spin" />
          </span>
        )}
      </button>

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4" />
            {value ? "Replace" : "Upload"}
          </Button>
          {showLibrary && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLibraryOpen(true)}
              disabled={uploading}
            >
              <Library className="size-4" />
              Library
            </Button>
          )}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onChange("")}
              disabled={uploading}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPG or WebP · up to 5 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {showLibrary && (
        <MediaPicker
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onSelect={(url) => {
            onChange(url);
            toast.success("Image chosen from the library.");
          }}
        />
      )}
    </div>
  );
}
