"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Award,
  Bell,
  BookOpen,
  CheckCheck,
  ClipboardList,
  FileQuestion,
  IndianRupee,
  Info,
  Megaphone,
  MessageSquare,
  Radio,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  NotificationItem,
  NotificationType,
} from "@/server/services/notification-service";

const TYPE_META: Record<NotificationType, { Icon: typeof Bell; tone: string }> =
  {
    SYSTEM: { Icon: Info, tone: "bg-muted text-muted-foreground" },
    COURSE: {
      Icon: BookOpen,
      tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    },
    PAYMENT: {
      Icon: IndianRupee,
      tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    LIVE_CLASS: {
      Icon: Radio,
      tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    },
    ASSIGNMENT: {
      Icon: ClipboardList,
      tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    },
    QUIZ: {
      Icon: FileQuestion,
      tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
    CERTIFICATE: {
      Icon: Award,
      tone: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
    },
    ANNOUNCEMENT: {
      Icon: Megaphone,
      tone: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    },
    DISCUSSION: {
      Icon: MessageSquare,
      tone: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    },
  };

function when(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * The full notifications screen — the same feed the header bell peeks at, with
 * room to read it. Opening one marks it read and follows its link; "Mark all
 * as read" clears the lot. Writes are fire-and-forget: the list updates at once
 * and the server catches up, the same way the bell behaves.
 */
export function NotificationsList({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.isRead).length;

  function open(n: NotificationItem) {
    if (!n.isRead) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
      );
      void api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.actionUrl) router.push(n.actionUrl);
  }

  function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    void api.post("/api/notifications/read-all").catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {unread > 0 ? `${unread} unread` : "You're all caught up"}
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center">
          <Bell className="size-8 opacity-40" />
          <p className="text-sm">No notifications yet.</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
            const Icon = meta.Icon;
            const clickable = Boolean(n.actionUrl);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  disabled={!clickable && n.isRead}
                  className={cn(
                    "flex w-full items-start gap-3 p-4 text-left transition-colors",
                    clickable || !n.isRead ? "hover:bg-muted/50" : "",
                    !n.isRead && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      meta.tone,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      {!n.isRead && (
                        <span
                          className="bg-primary size-2 shrink-0 rounded-full"
                          aria-label="Unread"
                        />
                      )}
                    </span>
                    {n.message && (
                      <span className="text-muted-foreground mt-0.5 block text-sm">
                        {n.message}
                      </span>
                    )}
                    <span className="text-muted-foreground mt-1 block text-xs">
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
  );
}
