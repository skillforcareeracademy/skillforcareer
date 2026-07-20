import { Quote, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TESTIMONIALS } from "@/config/marketing";

export function Testimonials() {
  return (
    <section className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">Careers, transformed</h2>
          <p className="text-muted-foreground mt-3">
            Real learners, real outcomes — promotions, switches and pay raises.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} className="gap-4 p-6">
              <Quote className="text-primary/30 size-8" aria-hidden />
              <p className="text-foreground/90 text-sm leading-relaxed">
                “{t.quote}”
              </p>
              <div className="mt-2 flex items-center gap-3 border-t pt-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.avatar}
                  alt={t.name}
                  loading="lazy"
                  className="ring-background size-11 shrink-0 rounded-full object-cover object-top ring-2"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {t.role}
                  </p>
                </div>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
