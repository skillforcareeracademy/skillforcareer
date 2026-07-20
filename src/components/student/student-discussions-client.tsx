"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  MessagesSquare,
  Reply as ReplyIcon,
  Pin,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { StudentThreadRow } from "@/server/services/discussion-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StudentDiscussionSheet } from "@/components/student/student-discussion-sheet";

interface Course {
  id: string;
  title: string;
}

const ALL = "all";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function label(t: StudentThreadRow): string {
  if (t.title) return t.title;
  return t.body.length > 90 ? `${t.body.slice(0, 90)}…` : t.body;
}

export function StudentDiscussionsClient({
  threads,
  courses,
  currentUserId,
}: {
  threads: StudentThreadRow[];
  courses: Course[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(ALL);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [form, setForm] = useState({ courseId: "", title: "", body: "" });
  const [posting, setPosting] = useState(false);

  const shown = useMemo(
    () => (filter === ALL ? threads : threads.filter((t) => t.courseId === filter)),
    [threads, filter],
  );
  const canAsk = courses.length > 0;

  async function ask(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      await api.post("/api/discussions", {
        courseId: form.courseId,
        title: form.title,
        body: form.body,
      });
      toast.success("Question posted.");
      setAskOpen(false);
      setForm({ courseId: "", title: "", body: "" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Couldn't post.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discussions"
        description="Ask questions and help fellow learners in your courses."
        actions={
          canAsk ? (
            <Button onClick={() => setAskOpen(true)}>
              <Plus className="size-4" /> Ask a question
            </Button>
          ) : undefined
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Enrol to join the conversation"
          description="Discussions are available in the courses you're enrolled in."
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v ?? ALL)}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue>
                  {(v) => (!v || v === ALL ? "All my courses" : (courses.find((c) => c.id === v)?.title ?? "Course"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All my courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No discussions yet"
              description="Be the first to ask a question in your course."
              action={
                <Button onClick={() => setAskOpen(true)}>
                  <Plus className="size-4" /> Ask a question
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {shown.map((t) => (
                <Card key={t.id} className="p-0">
                  <button
                    type="button"
                    data-slot="thread-row"
                    onClick={() => setDetailId(t.id)}
                    className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors"
                  >
                    <Avatar className="size-9 shrink-0">
                      {t.authorAvatar && <AvatarImage src={t.authorAvatar} alt={t.authorName} />}
                      <AvatarFallback className="text-xs">{initials(t.authorName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{label(t)}</p>
                        {t.isPinned && <Pin className="size-3.5 text-sky-500" />}
                        {t.isResolved && (
                          <Badge variant="secondary" className="gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" /> Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {t.courseTitle} · {t.authorName} · {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <ReplyIcon className="size-3.5" /> {t.replies}
                    </span>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Ask dialog */}
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ask a question</DialogTitle>
            <DialogDescription>Post to a course you&apos;re enrolled in.</DialogDescription>
          </DialogHeader>
          <form onSubmit={ask} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={form.courseId} onValueChange={(v) => setForm((f) => ({ ...f, courseId: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a course">
                    {(v) => courses.find((c) => c.id === v)?.title ?? "Choose a course"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-title">Title</Label>
              <Input
                id="d-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. How do I handle missing values?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-body">Question</Label>
              <Textarea
                id="d-body"
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Describe what you're stuck on…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAskOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={posting || !form.courseId || form.title.trim().length < 3 || form.body.trim().length === 0}
              >
                {posting && <Loader2 className="size-4 animate-spin" />}
                Post question
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <StudentDiscussionSheet
        threadId={detailId}
        currentUserId={currentUserId}
        onOpenChange={(o) => !o && setDetailId(null)}
      />
    </div>
  );
}
