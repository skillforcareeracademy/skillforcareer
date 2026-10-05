import { Quote, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HomeData } from "@/lib/validations/homepage";
import { imageProps } from "@/lib/image-sizes";

type Review = HomeData<"testimonials">["items"][number];

/** Enough cards to fill a wide screen, then the same set again so the loop
 *  lands back on its own start. Three reviews would otherwise leave a gap. */
const CARDS_PER_HALF = 6;

function buildTrack(items: Review[]): Review[] {
  if (items.length === 0) return []; // the loop below would never terminate
  const half: Review[] = [];
  while (half.length < CARDS_PER_HALF) half.push(...items);
  return [...half, ...half];
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <Card className="mr-6 w-[19rem] shrink-0 gap-4 p-6 sm:w-[22rem]">
      <Quote className="text-primary/30 size-8" aria-hidden />
      <p className="text-foreground/90 line-clamp-5 text-sm leading-relaxed">
        “{review.quote}”
      </p>
      <div className="mt-auto flex items-center gap-3 border-t pt-4">
        {review.avatar && (
          // Eager: the cards move by CSS transform, so the lazy-load observer
          // never fires for them and they scroll in blank.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...imageProps(review.avatar, 44)}
            alt={review.name}
            loading="eager"
            className="ring-background size-11 shrink-0 rounded-full object-cover object-top ring-2"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{review.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {review.role}
          </p>
        </div>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, star) => (
          <Star key={star} className="size-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
    </Card>
  );
}

export function Testimonials({ data }: { data: HomeData<"testimonials"> }) {
  if (data.items.length === 0) return null;
  const track = buildTrack(data.items);

  return (
    <section className="bg-muted/30 border-y">
      <div className="py-16 sm:py-24">
        <div className="container-page mb-12">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-3">{data.description}</p>
            )}
          </div>
        </div>

        {/* The row drifts across the page and stops under the pointer, so a
            review can be read without chasing it. Reduced-motion turns the
            animation off and leaves an ordinary scrolling row. */}
        <div className="marquee-row flex overflow-hidden px-4">
          <div className="marquee-track marquee-track-slow items-stretch">
            {track.map((review, i) => (
              <ReviewCard key={`${review.name}-${i}`} review={review} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
