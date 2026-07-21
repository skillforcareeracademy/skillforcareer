import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { getBannerPromo } from "@/server/services/coupon-service";
import { PromoCodeChip } from "./promo-code-chip";

/**
 * Top promo strip — entirely driven by the coupon the admin ticked "Show in
 * site banner" (Admin → Coupons). No live campaign, no bar: nothing here is
 * hardcoded, so the strip disappears the moment the offer ends or is unticked.
 */
export async function AnnouncementBar() {
  const promo = await getBannerPromo();
  if (!promo) return null;

  const endsOn = promo.expiresAt ? format(new Date(promo.expiresAt), "d MMM") : null;

  return (
    <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 text-white">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-xs font-medium sm:text-sm">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          {promo.headline} — <strong>{promo.discountLabel}</strong>
        </span>

        <PromoCodeChip code={promo.code} />

        {endsOn && <span className="text-white/80">Ends {endsOn}</span>}

        <Link
          href={promo.href}
          className="hidden items-center gap-1 underline underline-offset-2 hover:text-white/90 sm:inline-flex"
        >
          Explore <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
