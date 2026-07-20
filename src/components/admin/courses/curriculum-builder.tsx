"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  PlayCircle,
  FileText,
  FileQuestion,
  ClipboardList,
  Radio,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
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
import { ChapterDialog } from "./chapter-dialog";
import { LessonDialog } from "./lesson-dialog";
import type { CourseEdit } from "@/server/services/course-service";

type Chapter = CourseEdit["chapters"][number];
type Lesson = Chapter["lessons"][number];

const LESSON_ICON: Record<string, LucideIcon> = {
  VIDEO: PlayCircle,
  ARTICLE: FileText,
  PDF: FileText,
  QUIZ: FileQuestion,
  ASSIGNMENT: ClipboardList,
  LIVE: Radio,
};

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : "Action failed.";
}

export function CurriculumBuilder({
  courseId,
  chapters,
}: {
  courseId: string;
  chapters: Chapter[];
}) {
  const router = useRouter();
  const [chapterDialog, setChapterDialog] = useState<{ open: boolean; editing?: Chapter; nonce: number }>({ open: false, nonce: 0 });
  const [lessonDialog, setLessonDialog] = useState<{ open: boolean; chapterId?: string; editing?: Lesson; nonce: number }>({ open: false, nonce: 0 });
  const [delChapter, setDelChapter] = useState<Chapter | null>(null);
  const [delLesson, setDelLesson] = useState<Lesson | null>(null);

  const openChapter = (editing?: Chapter) =>
    setChapterDialog((s) => ({ open: true, editing, nonce: s.nonce + 1 }));
  const openLesson = (chapterId: string, editing?: Lesson) =>
    setLessonDialog((s) => ({ open: true, chapterId, editing, nonce: s.nonce + 1 }));

  async function confirmDeleteChapter() {
    if (!delChapter) return;
    try {
      await api.del(`/api/chapters/${delChapter.id}`);
      toast.success("Chapter deleted.");
      setDelChapter(null);
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function confirmDeleteLesson() {
    if (!delLesson) return;
    try {
      await api.del(`/api/lessons/${delLesson.id}`);
      toast.success("Lesson deleted.");
      setDelLesson(null);
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const lessonTotal = chapters.reduce((n, c) => n + c.lessons.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {chapters.length} chapters · {lessonTotal} lessons
        </p>
        <Button onClick={() => openChapter()}>
          <Plus className="size-4" /> Add chapter
        </Button>
      </div>

      {chapters.length === 0 ? (
        <EmptyState
          title="No chapters yet"
          description="Add your first chapter to start building the curriculum."
        />
      ) : (
        <div className="space-y-3">
          {chapters.map((ch, idx) => (
            <Card key={ch.id} className="gap-0 overflow-hidden p-0">
              <div className="bg-muted/30 flex items-center gap-3 border-b px-4 py-3">
                <span className="text-muted-foreground bg-background flex size-6 items-center justify-center rounded-md border text-xs font-medium">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{ch.title}</p>
                  {ch.description && (
                    <p className="text-muted-foreground truncate text-xs">{ch.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Edit chapter" onClick={() => openChapter(ch)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete chapter" className="text-destructive" onClick={() => setDelChapter(ch)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="divide-y">
                {ch.lessons.map((l) => {
                  const Icon = LESSON_ICON[l.type] ?? PlayCircle;
                  return (
                    <div key={l.id} className="hover:bg-muted/20 flex items-center gap-3 px-4 py-2.5">
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
                      {l.isPreview && (
                        <Badge variant="secondary" className="h-5 gap-1 text-[10px]">
                          <Eye className="size-3" /> Preview
                        </Badge>
                      )}
                      <span className="text-muted-foreground hidden text-xs capitalize sm:inline">
                        {l.type.toLowerCase()}
                      </span>
                      <Button variant="ghost" size="icon-sm" aria-label="Edit lesson" onClick={() => openLesson(ch.id, l)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete lesson" className="text-destructive" onClick={() => setDelLesson(l)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                <div className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => openLesson(ch.id)}
                  >
                    <Plus className="size-4" /> Add lesson
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ChapterDialog
        key={`ch-${chapterDialog.nonce}`}
        open={chapterDialog.open}
        onOpenChange={(o) => setChapterDialog((s) => ({ ...s, open: o }))}
        courseId={courseId}
        editing={chapterDialog.editing ?? null}
        onSaved={() => router.refresh()}
      />
      <LessonDialog
        key={`ls-${lessonDialog.nonce}`}
        open={lessonDialog.open}
        onOpenChange={(o) => setLessonDialog((s) => ({ ...s, open: o }))}
        chapterId={lessonDialog.chapterId ?? ""}
        editing={lessonDialog.editing ?? null}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={!!delChapter} onOpenChange={(o) => !o && setDelChapter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{delChapter?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the chapter and all its lessons. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChapter} className="bg-destructive hover:bg-destructive/90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!delLesson} onOpenChange={(o) => !o && setDelLesson(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{delLesson?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLesson} className="bg-destructive hover:bg-destructive/90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
