import { Quote, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HomeData } from "@/lib/validations/homepage";

export function Testimonials({ data }: { data: HomeData<"testimonials"> }) {
  if (data.items.length === 0) return null;

  return (
    <section className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="text-muted-foreground mt-3">{data.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {data.items.map((t, i) => (
            <Card key={`${t.name}-${i}`} className="gap-4 p-6">
              <Quote className="text-primary/30 size-8" aria-hidden />
              <p className="text-foreground/90 text-sm leading-relaxed">
                “{t.quote}”
              </p>
              <div className="mt-2 flex items-center gap-3 border-t pt-4">
                {t.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.avatar}
                    alt={t.name}
                    loading="lazy"
                    className="ring-background size-11 shrink-0 rounded-full object-cover object-top ring-2"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{t.role}</p>
                </div>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, star) => (
                  <Star key={star} className="size-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
