"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, Copy, ImageIcon, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaThumb } from "./media-thumb";
import { cn } from "@/lib/utils";

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  alt: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

interface MediaPage {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Copy a path to the clipboard, falling back where the API isn't available. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The media library, as a picker.
 *
 * The client's ask was literal: "create a media section in lms so that i can
 * upload images and can copy path and paste here". So this does both jobs — it
 * is the browser behind Admin → Media, and the "Choose from library" dialog
 * behind every image field on the homepage editor. Picking hands the URL back;
 * the copy button covers pasting it somewhere this component doesn't reach.
 */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Media library",
  description = "Pick an image, or upload a new one. Every file uploaded anywhere in the LMS shows up here.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to use it as a plain browser — the grid then only copies and deletes. */
  onSelect?: (url: string) => void;
  title?: string;
  description?: string;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((term: string) => {
    setLoading(true);
    const query = term.trim() ? `?kind=image&search=${encodeURIComponent(term.trim())}` : "?kind=image";
    api.get<MediaPage>(`/api/media${query}`).then(
      (page) => {
        setItems(page.items);
        setTotal(page.total);
        setLoading(false);
      },
      (e: unknown) => {
        setLoading(false);
        toast.error(e instanceof ApiError ? e.message : "Couldn't load the library.");
      },
    );
  }, []);

  // Mounted only while open (the dialog body is conditional), so this runs on
  // open and whenever the search term settles.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(id);
  }, [open, search, load]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} isn't an image.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 5 MB.`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Upload failed.");
        }
        added += 1;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Couldn't upload ${file.name}.`);
      }
    }
    setUploading(false);
    if (added > 0) {
      toast.success(`${added} image${added === 1 ? "" : "s"} uploaded.`);
      load(search);
    }
  }

  async function copy(url: string) {
    // An absolute address is what actually works when pasted into another tool;
    // the app itself is happy with either.
    const absolute = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (await copyToClipboard(absolute)) {
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
      toast.success("Path copied.");
    } else {
      toast.error("Couldn't copy — select the address and copy it by hand.");
    }
  }

  async function remove(item: MediaItem) {
    try {
      await api.del(`/api/media/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success("Removed from the library.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove that file.");
    }
  }

  function confirmSelection() {
    if (!selected || !onSelect) return;
    onSelect(selected);
    onOpenChange(false);
    setSelected(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name…"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={upload}
            />
          </div>

          {loading && items.length === 0 ? (
            <div className="text-muted-foreground grid h-56 place-items-center text-sm">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground grid h-56 place-items-center rounded-xl border border-dashed text-center text-sm">
              <div className="space-y-1">
                <ImageIcon className="mx-auto size-6" />
                <p>{search ? "Nothing matches that." : "No images yet."}</p>
                <p className="text-xs">Upload one and it will be reusable everywhere.</p>
              </div>
            </div>
          ) : (
            <ul className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {items.map((item) => {
                const isSelected = selected === item.url;
                return (
                  <li key={item.id}>
                    <div
                      className={cn(
                        "group bg-card overflow-hidden rounded-lg border transition-colors",
                        isSelected && "border-primary ring-primary/30 ring-2",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onSelect ? setSelected(isSelected ? null : item.url) : copy(item.url)
                        }
                        className="bg-muted/40 relative block aspect-4/3 w-full"
                        aria-label={onSelect ? `Select ${item.name}` : `Copy path of ${item.name}`}
                      >
                        <MediaThumb
                          url={item.url}
                          name={item.name}
                          alt={item.alt}
                          isImage={item.mime.startsWith("image/")}
                          sizes="(min-width: 640px) 20vw, 45vw"
                        />
                        {isSelected && (
                          <span className="bg-primary absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-white">
                            <Check className="size-3.5" />
                          </span>
                        )}
                      </button>

                      <div className="p-2">
                        <p className="truncate text-xs font-medium" title={item.name}>
                          {item.name}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {formatBytes(item.size)}
                        </p>
                        <div className="mt-1.5 flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 flex-1 px-2 text-xs"
                            onClick={() => copy(item.url)}
                          >
                            {copied === item.url ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            Copy path
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive size-7"
                            onClick={() => remove(item)}
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-muted-foreground text-xs">
            {total} image{total === 1 ? "" : "s"} in the library · PNG, JPG, WebP or AVIF
            up to 5 MB
          </p>
        </DialogBody>

        {onSelect && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSelection} disabled={!selected}>
              Use this image
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
