import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HomeData } from "@/lib/validations/homepage";

/**
 * The academy's own cards under the buy box — "do teen card bna do. Jisko mai
 * edit kr skta hu time to time for branding purpose of our different partner
 * companies."
 *
 * Written in Admin → Homepage → Course page ads, and shown on every course
 * page. A card with nowhere to go is still a card; only the arrow is dropped.
 */
export function CoursePromos({ data }: { data: HomeData<"coursePromos"> }) {
  const items = data.items.filter((i) => i.title || i.image || i.body);
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const inner = (
          <Card className="gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md">
            {item.image && (
              // A partner's artwork, from anywhere the academy pasted it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image}
                alt={item.title || "Advertisement"}
                className="h-28 w-full object-cover"
                loading="lazy"
              />
            )}
            {(item.title || item.body || item.linkLabel) && (
              <div className="space-y-1 p-4">
                {item.title && (
                  <p className="text-sm font-semibold">{item.title}</p>
                )}
                {item.body && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {item.body}
                  </p>
                )}
                {item.linkLabel && item.href && (
                  <span className="text-primary inline-flex items-center gap-1 pt-1 text-xs font-semibold">
                    {item.linkLabel} <ArrowRight className="size-3.5" />
                  </span>
                )}
              </div>
            )}
          </Card>
        );

        if (!item.href) {
          return <div key={`${item.title}-${i}`}>{inner}</div>;
        }
        // An outside address opens in a new tab so the course page is not lost;
        // one of our own stays in place.
        const external = /^https?:\/\//i.test(item.href);
        return external ? (
          <a
            key={`${item.title}-${i}`}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block"
          >
            {inner}
          </a>
        ) : (
          <Link key={`${item.title}-${i}`} href={item.href} className="block">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
