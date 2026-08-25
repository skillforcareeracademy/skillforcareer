import { Star } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CourseReview } from "@/server/services/course-service";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? "size-4 fill-amber-400 text-amber-400"
              : "text-muted-foreground/30 size-4"
          }
        />
      ))}
    </div>
  );
}

/** Reviews left by learners on this specific course. */
export function CourseReviews({
  reviews,
  ratingAvg,
  ratingCount,
}: {
  reviews: CourseReview[];
  ratingAvg: number;
  ratingCount: number;
}) {
  if (reviews.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold">Learner reviews</h2>
        {ratingCount > 0 && (
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <span className="text-foreground font-semibold">{ratingAvg.toFixed(1)}</span>
            · {ratingCount.toLocaleString("en-IN")} rating
            {ratingCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {reviews.map((r) => (
          <Card key={r.id} className="gap-3 p-5">
            <div className="flex items-center gap-3">
              <Avatar className="size-9">
                {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.author} />}
                <AvatarFallback className="text-xs">{initials(r.author)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.author}</p>
                <p className="text-muted-foreground text-xs">
                  {format(new Date(r.createdAt), "d MMM yyyy")}
                </p>
              </div>
            </div>
            <Stars rating={r.rating} />
            {r.comment && (
              <p className="text-foreground/90 text-sm leading-relaxed">{r.comment}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
