"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BookOpen,
  IndianRupee,
  Radio,
  ClipboardList,
  FileQuestion,
  Award,
  Megaphone,
  MessageSquare,
  Info,
  CheckCheck,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  NotificationFeed,
  NotificationItem,
  NotificationType,
} from "@/server/services/notification-service";

/** How often to re-check while the tab is in front. */
const POLL_MS = 30_000;

const TYPE_META: Record<
  NotificationType,
  { Icon: typeof Bell; tone: string }
> = {
  SYSTEM: { Icon: Info, tone: "bg-muted text-muted-foreground" },
  COURSE: { Icon: BookOpen, tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
  PAYMENT: { Icon: IndianRupee, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  LIVE_CLASS: { Icon: Radio, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
  ASSIGNMENT: { Icon: ClipboardList, tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" },
  QUIZ: { Icon: FileQuestion, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  CERTIFICATE: { Icon: Award, tone: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" },
  ANNOUNCEMENT: { Icon: Megaphone, tone: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" },
  DISCUSSION: { Icon: MessageSquare, tone: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
};

function when(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = () => {
      api
        .get<NotificationFeed>("/api/notifications")
        .then((d) => {
          if (!alive) return;
          setFeed(d);
          setLoaded(true);
        })
        // A failed poll is not worth a toast — the next one will catch up.
        .catch(() => alive && setLoaded(true));
    };

    load();
    // Polling rather than a socket: the signalling server is deployed
    // separately and only for live classes, so tying the bell to it would make
    // notifications go dark whenever that service is down.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    // Coming back to the tab should feel instant rather than waiting out the poll.
    const onWake = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.isRead) {
      // Optimistic — the row shouldn't sit there looking unread while we wait.
      setFeed((f) => ({
        unread: Math.max(0, f.unread - 1),
        items: f.items.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)),
      }));
      await api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.actionUrl) router.push(n.actionUrl);
  }

  async function readAll() {
    setFeed((f) => ({
      unread: 0,
      items: f.items.map((i) => ({ ...i, isRead: true })),
    }));
    await api.post("/api/notifications/read-all").catch(() => {});
  }

  const { items, unread } = feed;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
            }
            className="relative"
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="bg-primary ring-background absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white ring-2">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">
            Notifications
            {unread > 0 && (
              <span className="text-muted-foreground ml-1.5 font-normal">
                ({unread} new)
              </span>
            )}
          </p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={readAll}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {!loaded ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Bell className="text-muted-foreground mb-2 size-7" />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Class updates, payments and grading will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "hover:bg-accent flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                        !n.isRead && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                          meta.tone,
                        )}
                      >
                        <meta.Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                          )}
                        </span>
                        <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs">
                          {n.message}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-[11px]">
                          {when(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
