"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Send, Loader2, Trash2, MessageSquare, BookOpen, CheckCircle2, Pin } from "lucide-react";
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
interface Detail {
  id: string;
  title: string | null;
  body: string;
  isPinned: boolean;
  isResolved: boolean;
  createdAt: string;
  course: { title: string; slug: string } | null;
  author: Person;
  replies: { id: string; body: string; createdAt: string; author: Person }[];
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function StudentDiscussionSheet({
  threadId,
  currentUserId,
  onOpenChange,
}: {
  threadId: string | null;
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={threadId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {threadId && (
          <Body threadId={threadId} currentUserId={currentUserId} onClosed={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  threadId,
  currentUserId,
  onClosed,
}: {
  threadId: string;
  currentUserId: string;
  onClosed: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);

  function load() {
    return api.get<Detail>(`/api/discussions/${threadId}`).then(setData).catch(() => setError(true));
  }
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/api/discussions/${threadId}`).then((d) => alive && setData(d)).catch(() => alive && setError(true));
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
  async function removeReply(id: string) {
    setData((d) => (d ? { ...d, replies: d.replies.filter((r) => r.id !== id) } : d));
    await api.del(`/api/discussions/${id}`).catch(() => {});
    router.refresh();
  }
  async function removeThread() {
    try {
      await api.del(`/api/discussions/${threadId}`);
      toast.success("Deleted.");
      router.refresh();
      onClosed();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
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
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const ownThread = data.author.id === currentUserId;

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="text-lg leading-snug">{data.title ?? "Discussion"}</SheetTitle>
          <div className="flex shrink-0 gap-1.5">
            {data.isPinned && (
              <Badge variant="secondary" className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <Pin className="size-3" /> Pinned
              </Badge>
            )}
            {data.isResolved && (
              <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Resolved
              </Badge>
            )}
          </div>
        </div>
        {data.course && (
          <SheetDescription className="flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> {data.course.title}
          </SheetDescription>
        )}
      </SheetHeader>

      <div className="space-y-5 p-6">
        <div className="flex gap-3">
          <Avatar className="size-9 shrink-0">
            {data.author.avatarUrl && <AvatarImage src={data.author.avatarUrl} alt={data.author.name} />}
            <AvatarFallback className="text-xs">{initials(data.author.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{data.author.name}</span>
              {ownThread && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
              <span className="text-muted-foreground ml-2 text-xs">
                {format(new Date(data.createdAt), "d MMM, h:mm a")}
              </span>
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{data.body}</p>
            {ownThread && (
              <Button variant="ghost" size="sm" className="text-muted-foreground mt-1 h-7 px-2" onClick={removeThread}>
                <Trash2 className="size-3.5" /> Delete question
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-medium">
            <MessageSquare className="size-3.5" />
            {data.replies.length} {data.replies.length === 1 ? "reply" : "replies"}
          </p>
          <div className="space-y-4 border-l pl-3">
            {data.replies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No replies yet. Be the first to help!</p>
            ) : (
              data.replies.map((r) => {
                const own = r.author.id === currentUserId;
                return (
                  <div key={r.id} className="flex gap-3">
                    <Avatar className="size-8 shrink-0">
                      {r.author.avatarUrl && <AvatarImage src={r.author.avatarUrl} alt={r.author.name} />}
                      <AvatarFallback className="text-[10px]">{initials(r.author.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{r.author.name}</span>
                        {own && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {format(new Date(r.createdAt), "d MMM, h:mm a")}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm whitespace-pre-wrap">{r.body}</p>
                    </div>
                    {own && (
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground shrink-0" onClick={() => removeReply(r.id)} aria-label="Delete reply">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <form onSubmit={postReply} className="sticky bottom-0 space-y-2 border-t bg-popover p-4">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a reply…" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={posting || !reply.trim()}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Reply
          </Button>
        </div>
      </form>
    </div>
  );
}
