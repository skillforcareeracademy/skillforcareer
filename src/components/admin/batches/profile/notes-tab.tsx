"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { BatchNoteRow } from "@/server/services/batch-note-service";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { when } from "./format";

/** PDF, Office documents and images — what instructors actually hand out. */
const ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*";
const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface FormState {
  title: string;
  body: string;
  fileUrl: string;
  fileName: string;
}
const EMPTY: FormState = { title: "", body: "", fileUrl: "", fileName: "" };

export function NotesTab({
  batchId,
  notes,
  canEdit,
}: {
  batchId: string;
  notes: BatchNoteRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BatchNoteRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BatchNoteRow | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }
  function openEdit(n: BatchNoteRow) {
    setEditing(n);
    setForm({
      title: n.title,
      body: n.body ?? "",
      fileUrl: n.fileUrl ?? "",
      fileName: n.fileName ?? "",
    });
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/batches/${batchId}/notes/${editing.id}`, form);
        toast.success("Note saved.");
      } else {
        await api.post(`/api/batches/${batchId}/notes`, form);
        toast.success("Note shared with the batch.");
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/batches/${batchId}/notes/${deleting.id}`);
      toast.success("Note deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete.");
    }
  }

  const canSave =
    form.title.trim().length >= 2 && Boolean(form.body.trim() || form.fileUrl);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Everyone on this batch sees these notes under{" "}
          <strong>My Learning</strong> and in the app.
        </p>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New note
          </Button>
        )}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No notes shared yet"
          description="Share slides, reading material or a quick write-up with the whole batch."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => (
            <Card key={n.id} className="gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {when(n.createdAt)}
                    {n.authorName ? ` · ${n.authorName}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                      aria-label="Note actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(n)}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleting(n)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {n.body && (
                <p className="text-muted-foreground line-clamp-6 text-sm whitespace-pre-line">
                  {n.body}
                </p>
              )}
              {n.fileUrl && (
                <a
                  href={n.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-muted/60 hover:bg-muted flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <Paperclip className="size-4 shrink-0" />
                  <span className="truncate">{n.fileName || "Attachment"}</span>
                </a>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
            <DialogDescription>
              Write something, attach a file, or both. Learners on the batch are
              notified of new notes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={form.title}
                maxLength={191}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Week 3 — SQL joins slides"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-body">Text</Label>
              <Textarea
                id="note-body"
                rows={6}
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                placeholder="Anything the batch should read before the next class…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Attachment</Label>
              <NoteFile
                url={form.fileUrl}
                name={form.fileName}
                onChange={(fileUrl, fileName) =>
                  setForm((f) => ({ ...f, fileUrl, fileName }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Share note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Learners on the batch will no longer see it.
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

/**
 * Upload through the shared `/api/upload`: images go up as `kind=image`,
 * everything else as a document, so both halves of "PDF / DOC / PPT / images"
 * land in the same media library with the same size rules as elsewhere.
 */
function NoteFile({
  url,
  name,
  onChange,
}: {
  url: string;
  name: string;
  onChange: (url: string, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES)) {
      toast.error(
        isImage ? "Images must be under 5 MB." : "Files must be under 25 MB.",
      );
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", isImage ? "image" : "doc");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success)
        throw new Error(json?.error?.message ?? "Upload failed.");
      onChange(json.data.url as string, file.name);
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {url ? (
        <div className="bg-muted/60 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <FileText className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {name ||
              decodeURIComponent(url.split("?")[0].split("/").pop() ?? url)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove attachment"
            onClick={() => onChange("", "")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          PDF, Word, PowerPoint, Excel, text or ZIP up to 25 MB · images up to 5
          MB
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        {url ? "Replace file" : "Upload file"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={pick}
      />
    </div>
  );
}
