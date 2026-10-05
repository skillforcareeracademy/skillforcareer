import Image from "next/image";
import { Building2 } from "lucide-react";
import type { HomeData } from "@/lib/validations/homepage";

type Partner = HomeData<"partners">["placementItems"][number];

/**
 * One row of logos. A partner with a website is a link; one without is just a
 * tile, so a logo can go up before anyone has chased the URL.
 */
function PartnerRow({ title, items }: { title: string; items: Partner[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      {title && (
        <h3 className="text-muted-foreground mb-5 text-center text-sm font-semibold tracking-wide uppercase">
          {title}
        </h3>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {items.map((p, i) => {
          const tile = (
            <span className="bg-card flex h-20 w-36 items-center justify-center rounded-xl border p-4 transition-shadow hover:shadow-md sm:w-44">
              {p.logo ? (
                <Image
                  src={p.logo}
                  alt={p.name}
                  width={128}
                  height={48}
                  className="max-h-12 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-muted-foreground flex items-center gap-1.5 text-center text-sm font-medium">
                  <Building2 className="size-4 shrink-0" />
                  {p.name}
                </span>
              )}
            </span>
          );
          return p.href ? (
            <a
              key={`${p.name}-${i}`}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              title={p.name}
            >
              {tile}
            </a>
          ) : (
            <span key={`${p.name}-${i}`} title={p.name}>
              {tile}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Placement and hiring partners — "placement partners and hiring partners ka
 * bhi section backend me daal do". Ships switched off and empty; filling either
 * row in Admin → Homepage and enabling the section is what puts it on the page.
 */
export function PartnersSection({ data }: { data: HomeData<"partners"> }) {
  const hasAny = data.placementItems.length > 0 || data.hiringItems.length > 0;
  if (!hasAny) return null;

  return (
    <section id="partners" className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="text-muted-foreground mt-2">{data.description}</p>
          )}
        </div>
        <div className="space-y-10">
          <PartnerRow title={data.placementTitle} items={data.placementItems} />
          <PartnerRow title={data.hiringTitle} items={data.hiringItems} />
        </div>
      </div>
    </section>
  );
}
