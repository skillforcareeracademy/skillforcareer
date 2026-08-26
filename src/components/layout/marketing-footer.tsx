import Link from "next/link";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { FooterLinkColumns, type FooterColumn } from "./footer-link-columns";
import { socialFor } from "@/config/social";
import { getHomeSection } from "@/server/services/homepage-service";
import { cn } from "@/lib/utils";

/**
 * How wide the whole footer grid is: two columns for the brand, two for the
 * contact details, and one per link column. Spelling the classes out keeps them
 * discoverable by Tailwind, which never sees an interpolated class name.
 */
const GRID_COLS: Record<number, string> = {
  0: "lg:grid-cols-4",
  1: "lg:grid-cols-5",
  2: "lg:grid-cols-6",
  3: "lg:grid-cols-7",
  4: "lg:grid-cols-8",
};

/**
 * Public site footer — every word, link, address and social account comes from
 * Admin → Homepage → Footer. The logo is Settings → Branding.
 */
export async function MarketingFooter() {
  const section = await getHomeSection("footer");
  const {
    about,
    offices,
    columns,
    contactTitle,
    phone,
    phoneDisplay,
    email,
    hours,
    socials,
    copyright,
    legalLinks,
  } = section.data;

  // Half-filled rows in the editor are treated as "not finished yet" rather
  // than rendered as empty headings and links to nowhere.
  const linkColumns: FooterColumn[] = columns
    .map((col) => ({
      title: col.title.trim(),
      links: col.links.filter((l) => l.label.trim() && l.href.trim()),
    }))
    .filter((col) => col.title && col.links.length > 0);

  const socialLinks = socials.filter((s) => s.href.trim());
  const legal = legalLinks.filter((l) => l.label.trim() && l.href.trim());
  const hasContact = phoneDisplay.trim() || email.trim() || hours.trim();

  return (
    <footer className="border-t bg-muted/20">
      <div className="container-page py-14">
        <div className={cn("grid grid-cols-2 gap-8", GRID_COLS[linkColumns.length] ?? GRID_COLS[3])}>
          {/* Brand + addresses */}
          <div className="col-span-2">
            <Logo className="h-14" />
            {about.trim() && (
              <p className="text-muted-foreground mt-4 max-w-xs text-sm">{about}</p>
            )}

            {offices.length > 0 && (
              <div className="mt-5 space-y-3">
                {offices.map((o, i) => (
                  <div key={`${o.label}-${i}`} className="flex gap-2.5 text-sm">
                    <MapPin className="text-primary mt-0.5 size-4 shrink-0" />
                    <p className="text-muted-foreground">
                      {o.label.trim() && (
                        <>
                          <span className="text-foreground font-medium">{o.label}</span>
                          <br />
                        </>
                      )}
                      {[o.line1, o.line2].filter((l) => l.trim()).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FooterLinkColumns columns={linkColumns} />

          {/* Get in touch */}
          <div className="col-span-2">
            {contactTitle.trim() && (
              <h3 className="text-sm font-semibold">{contactTitle}</h3>
            )}

            {hasContact && (
              <ul className="text-muted-foreground mt-4 space-y-3 text-sm">
                {phoneDisplay.trim() && (
                  <li>
                    <a
                      href={`tel:${phone || phoneDisplay}`}
                      className="hover:text-foreground flex items-center gap-2 transition-colors"
                    >
                      <Phone className="size-4 shrink-0" /> {phoneDisplay}
                    </a>
                  </li>
                )}
                {email.trim() && (
                  <li>
                    <a
                      href={`mailto:${email}`}
                      className="hover:text-foreground flex items-center gap-2 whitespace-nowrap transition-colors"
                    >
                      <Mail className="size-4 shrink-0" /> {email}
                    </a>
                  </li>
                )}
                {hours.trim() && (
                  <li className="flex items-center gap-2 whitespace-nowrap">
                    <Clock className="size-4 shrink-0" /> {hours}
                  </li>
                )}
              </ul>
            )}

            {socialLinks.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {socialLinks.map((s, i) => {
                  const brand = socialFor(s.platform);
                  return (
                    <a
                      key={`${s.platform}-${i}`}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={brand.label}
                      className="text-muted-foreground hover:text-primary hover:border-primary/40 flex size-9 items-center justify-center rounded-full border transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                        <path d={brand.path} />
                      </svg>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          {/* `{year}` rather than a hardcoded date, so the line never has to be
              edited again each January. */}
          <p className="text-muted-foreground text-sm">
            {copyright.replaceAll("{year}", String(new Date().getFullYear()))}
          </p>
          {legal.length > 0 && (
            <div className="text-muted-foreground flex items-center gap-5 text-sm">
              {legal.map((l) => (
                <Link
                  key={`${l.label}-${l.href}`}
                  href={l.href}
                  className="hover:text-foreground transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
