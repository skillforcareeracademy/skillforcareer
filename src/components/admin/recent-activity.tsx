import { UserPlus, CreditCard, GraduationCap, type LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/shared/empty-state";

export interface ActivityFeedItem {
  id: string;
  title: string;
  subtitle: string;
  at: string;
  kind: "user" | "payment" | "enrollment";
}

const ICONS: Record<ActivityFeedItem["kind"], LucideIcon> = {
  user: UserPlus,
  payment: CreditCard,
  enrollment: GraduationCap,
};

export function RecentActivity({ items }: { items: ActivityFeedItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="New signups, enrollments and payments will show up here."
        className="border-0 bg-transparent py-8"
      />
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((it) => {
        const Icon = ICONS[it.kind];
        return (
          <li key={it.id} className="flex items-start gap-3">
            <span className="bg-muted mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
              <Icon className="text-muted-foreground size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {it.subtitle}
              </p>
            </div>
            <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(it.at), { addSuffix: true })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
