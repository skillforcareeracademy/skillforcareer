"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Pin,
  PinOff,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Send,
  Loader2,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}
interface Reply {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
}
interface Detail {
  id: string;
  title: string | null;
  body: string;
  isPinned: boolean;
  isResolved: boolean;
  createdAt: string;
  course: { title: string; slug: string } | null;
  author: Person;
  replies: Reply[];
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function DiscussionDetailSheet({
  threadId,
  onOpenChange,
}: {
  threadId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={threadId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {threadId && <DetailBody key={threadId} threadId={threadId} onClosed={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ threadId, onClosed }: { threadId: string; onClosed: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    return api.get<Detail>(`/api/discussions/${threadId}`).then(setData).catch(() => setError(true));
  }
  useEffect(() => {
    let alive = true;
    api
      .get<Detail>(`/api/discussions/${threadId}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [threadId]);

  async function postReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/discussions/${threadId}/reply`, { body: reply });
      setReply("");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't post reply.");
    } finally {
      setPosting(false);
    }
  }

  async function moderate(patch: { isPinned?: boolean; isResolved?: boolean }) {
    setBusy(true);
    try {
      await api.patch(`/api/discussions/${threadId}`, patch);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/discussions/${threadId}`);
      toast.success("Discussion deleted.");
      router.refresh();
      onClosed();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Discussion</SheetTitle>
          <SheetDescription>Couldn&apos;t load this discussion.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="text-lg leading-snug">
            {data.title ?? "Discussion"}
          </SheetTitle>
          <div className="flex shrink-0 gap-1.5">
            {data.isPinned && (
              <Badge variant="secondary" className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <Pin className="size-3" /> Pinned
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={
                data.isResolved
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
              }
            >
              {data.isResolved ? "Resolved" : "Open"}
            </Badge>
          </div>
        </div>
        {data.course && (
          <SheetDescription className="flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> {data.course.title}
          </SheetDescription>
        )}
      </SheetHeader>

      {/* Moderation bar */}
      <div className="flex flex-wrap gap-2 border-b p-3">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => moderate({ isPinned: !data.isPinned })}>
          {data.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          {data.isPinned ? "Unpin" : "Pin"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => moderate({ isResolved: !data.isResolved })}>
          {data.isResolved ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
          {data.isResolved ? "Reopen" : "Resolve"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={remove}
          className="text-destructive hover:text-destructive ml-auto"
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <div className="space-y-5 p-6">
        {/* Original post */}
        <div className="flex gap-3">
          <Avatar className="size-9 shrink-0">
            {data.author.avatarUrl && <AvatarImage src={data.author.avatarUrl} alt={data.author.name} />}
            <AvatarFallback className="text-xs">{initials(data.author.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{data.author.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">
                {format(new Date(data.createdAt), "d MMM, h:mm a")}
              </span>
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{data.body}</p>
          </div>
        </div>

        {/* Replies */}
        <div>
          <p className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-medium">
            <MessageSquare className="size-3.5" />
            {data.replies.length} {data.replies.length === 1 ? "reply" : "replies"}
          </p>
          <div className="space-y-4 border-l pl-3">
            {data.replies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No replies yet.</p>
            ) : (
              data.replies.map((r) => (
                <div key={r.id} className="flex gap-3">
                  <Avatar className="size-8 shrink-0">
                    {r.author.avatarUrl && <AvatarImage src={r.author.avatarUrl} alt={r.author.name} />}
                    <AvatarFallback className="text-[10px]">{initials(r.author.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{r.author.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {format(new Date(r.createdAt), "d MMM, h:mm a")}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Reply box */}
      <form onSubmit={postReply} className="sticky bottom-0 space-y-2 border-t bg-popover p-4">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Reply as staff…"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={posting || !reply.trim()}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Post reply
          </Button>
        </div>
      </form>
    </div>
  );
}
