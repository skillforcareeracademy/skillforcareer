"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { FileUpload } from "@/components/shared/file-upload";
import { LESSON_TYPES } from "@/lib/validations/curriculum";

interface LessonLite {
  id: string;
  title: string;
  type: string;
  isPreview: boolean;
  durationSeconds: number;
  content: string | null;
  videoUrl: string;
  attachmentUrl: string;
}

const TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video",
  ARTICLE: "Article",
  PDF: "PDF / document",
  QUIZ: "Quiz",
  ASSIGNMENT: "Assignment",
  LIVE: "Live class",
};

export function LessonDialog({
  open,
  onOpenChange,
  chapterId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chapterId: string;
  editing: LessonLite | null;
  onSaved: () => void;
}) {
  // Parent remounts this via `key` on each open, so init from `editing` here.
  const [title, setTitle] = useState(editing?.title ?? "");
  const [type, setType] = useState(editing?.type ?? "VIDEO");
  const [videoUrl, setVideoUrl] = useState(editing?.videoUrl ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(editing?.attachmentUrl ?? "");
  const [durationMin, setDurationMin] = useState(
    editing?.durationSeconds ? String(Math.round(editing.durationSeconds / 60)) : "",
  );
  const [isPreview, setIsPreview] = useState(editing?.isPreview ?? false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        title,
        type,
        videoUrl: type === "VIDEO" ? videoUrl : "",
        content: type === "ARTICLE" ? content : "",
        attachmentUrl:
          type === "PDF" || type === "ASSIGNMENT" || type === "QUIZ"
            ? attachmentUrl
            : "",
        durationSeconds: (Number(durationMin) || 0) * 60,
        isPreview,
      };
      if (editing) await api.patch(`/api/lessons/${editing.id}`, body);
      else await api.post(`/api/chapters/${chapterId}/lessons`, body);
      toast.success(editing ? "Lesson updated." : "Lesson added.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit lesson" : "Add lesson"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ls-title">Title</Label>
            <Input id="ls-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-dur">Duration (minutes)</Label>
              <Input id="ls-dur" type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="0" />
            </div>
          </div>

          {type === "VIDEO" && (
            <div className="space-y-1.5">
              <Label htmlFor="ls-video">Video URL</Label>
              <Input
                id="ls-video"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube, Google Drive, Vimeo or an .mp4 link"
              />
              <p className="text-muted-foreground text-xs">
                YouTube, Vimeo and Google Drive links play inline — no need to
                convert them to an embed URL first.
              </p>
            </div>
          )}
          {type === "ARTICLE" && (
            <div className="space-y-1.5">
              <Label>Content</Label>
              <RichTextEditor value={content} onChange={setContent} />
            </div>
          )}
          {(type === "PDF" || type === "ASSIGNMENT" || type === "QUIZ") && (
            <div className="space-y-2.5">
              <Label>{type === "PDF" ? "Document" : "Reference material (optional)"}</Label>
              <FileUpload
                value={attachmentUrl}
                onChange={(url) => setAttachmentUrl(url)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="ls-file" className="text-muted-foreground text-xs font-normal">
                  …or paste a link
                </Label>
                <Input
                  id="ls-file"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="Google Drive, Docs or a direct .pdf link"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="ls-preview">Free preview</Label>
              <p className="text-muted-foreground text-xs">Let non-enrolled learners watch this</p>
            </div>
            <Switch id="ls-preview" checked={isPreview} onCheckedChange={setIsPreview} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || title.trim().length < 2}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
