"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { format } from "date-fns";
import { Check, Copy, ImageIcon, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { copyToClipboard, formatBytes, type MediaItem } from "@/components/shared/media-picker";
import { MediaThumb } from "@/components/shared/media-thumb";

interface MediaPage {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

const KINDS = [
  { value: "all", label: "Everything" },
  { value: "image", label: "Images" },
  { value: "doc", label: "Documents" },
];

/**
 * Admin → Media.
 *
 * The client's request, verbatim: "create a media section in lms so that i can
 * upload images and can copy path and paste here". So the whole page is built
 * around those two verbs — drop files in, copy a path out. Everything uploaded
 * anywhere else in the LMS lands here too, which is what makes it worth opening.
 */
export function MediaClient({ initial }: { initial: MediaPage }) {
  const [page, setPage] = useState(initial);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((term: string, only: string) => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "48" });
    if (term.trim()) params.set("search", term.trim());
    if (only !== "all") params.set("kind", only);

    api.get<MediaPage>(`/api/media?${params}`).then(
      (next) => {
        setPage(next);
        setLoading(false);
      },
      (e: unknown) => {
        setLoading(false);
        toast.error(e instanceof ApiError ? e.message : "Couldn't load the library.");
      },
    );
  }, []);

  // Debounced so typing a filename doesn't fire a request per keystroke.
  const [applied, setApplied] = useState({ search: "", kind: "all" });
  useEffect(() => {
    if (applied.search === search && applied.kind === kind) return;
    const id = setTimeout(
      () => {
        setApplied({ search, kind });
        load(search, kind);
      },
      search === applied.search ? 0 : 300,
    );
    return () => clearTimeout(id);
  }, [search, kind, applied, load]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    let added = 0;
    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      if (file.size > (isImage ? MAX_BYTES : 25 * 1024 * 1024)) {
        toast.error(`${file.name} is too large.`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        // Anything that isn't an image goes through the document path, so a
        // brochure or a syllabus PDF can live in the library too.
        if (!isImage) fd.append("kind", "doc");
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
      toast.success(`${added} file${added === 1 ? "" : "s"} uploaded.`);
      load(applied.search, applied.kind);
    }
  }

  async function copy(item: MediaItem) {
    const absolute = item.url.startsWith("http")
      ? item.url
      : `${window.location.origin}${item.url}`;
    if (await copyToClipboard(absolute)) {
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
      toast.success("Path copied — paste it into any image field.");
    } else {
      toast.error("Couldn't copy — select the address and copy it by hand.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const item = deleting;
    setDeleting(null);
    try {
      await api.del(`/api/media/${item.id}`);
      setPage((p) => ({
        ...p,
        items: p.items.filter((i) => i.id !== item.id),
        total: Math.max(0, p.total - 1),
      }));
      toast.success("Removed from the library.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove that file.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media"
        description="Every image and document uploaded across the LMS. Copy a path here and paste it into any image field."
        actions={
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Upload files
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={upload}
      />

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by file name…"
              className="pl-9"
            />
          </div>
          <Select value={kind} onValueChange={(v) => v && setKind(v)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue>
                {(v) => KINDS.find((k) => k.value === v)?.label ?? "Everything"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-muted-foreground grid h-64 place-items-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : page.items.length === 0 ? (
        <div className="text-muted-foreground grid h-64 place-items-center rounded-xl border border-dashed text-center">
          <div className="space-y-1.5">
            <ImageIcon className="mx-auto size-7" />
            <p className="text-sm">
              {search ? "Nothing matches that." : "Nothing in the library yet."}
            </p>
            <p className="text-xs">
              Upload an image and its path becomes reusable everywhere.
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {page.items.map((item) => {
            const isImage = item.mime.startsWith("image/");
            return (
              <li key={item.id}>
                <div className="bg-card overflow-hidden rounded-xl border">
                  <div className="bg-muted/40 relative aspect-4/3">
                    <MediaThumb
                      url={item.url}
                      name={item.name}
                      alt={item.alt}
                      isImage={isImage}
                      sizes="(min-width: 1280px) 18vw, (min-width: 640px) 30vw, 45vw"
                    />
                  </div>

                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-medium" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(item.size)} ·{" "}
                      {format(new Date(item.createdAt), "d MMM yyyy")}
                    </p>

                    <div className="flex gap-1.5 pt-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 px-2 text-xs"
                        onClick={() => copy(item)}
                      >
                        {copied === item.id ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {copied === item.id ? "Copied" : "Copy path"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive size-8"
                        onClick={() => setDeleting(item)}
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

      <p className="text-muted-foreground text-sm">
        {page.total} file{page.total === 1 ? "" : "s"} in the library
      </p>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Any page still pointing at this file will show a broken image. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
