import Link from "next/link";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import {
  FooterLinkColumns,
  type FooterColumn,
} from "./footer-link-columns";
import { siteConfig } from "@/config/site";

const { contact } = siteConfig;

const COLUMNS: FooterColumn[] = [
  {
    title: "Categories",
    links: [
      { label: "Data Science", href: "/courses?category=data-science" },
      { label: "AI & Machine Learning", href: "/courses?category=ai-ml" },
      { label: "Management & MBA", href: "/courses?category=management" },
      { label: "Software Development", href: "/courses?category=software-development" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "For Business", href: "/for-business" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Live classes", href: "/live-classes" },
      { label: "Webinars", href: "/webinars" },
      { label: "Browse courses", href: "/courses" },
      { label: "Verify certificate", href: "/verify" },
    ],
  },
];

// Brand glyphs (lucide has no social icons in this version) — simple-icons paths.
const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: "Instagram",
    href: contact.social.instagram,
    path: "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.66 1.34 1.07 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.13-1.38.66-.67 1.07-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.31-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1018.16 12 6.16 6.16 0 0012 5.84zM12 16a4 4 0 114-4 4 4 0 01-4 4zm6.41-10.85a1.44 1.44 0 101.44 1.44 1.44 1.44 0 00-1.44-1.44z",
  },
  {
    label: "YouTube",
    href: contact.social.youtube,
    path: "M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 00.5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 002.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 002.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z",
  },
  {
    label: "Facebook",
    href: contact.social.facebook,
    path: "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z",
  },
  {
    label: "LinkedIn",
    href: contact.social.linkedin,
    path: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 11.01-4.12 2.06 2.06 0 01-.01 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z",
  },
  {
    label: "X",
    href: contact.social.x,
    path: "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z",
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container-page py-14">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-7">
          {/* Brand + contact */}
          <div className="col-span-2">
            <Logo className="h-14" />
            <p className="text-muted-foreground mt-4 max-w-xs text-sm">
              {siteConfig.description}
            </p>

            <div className="mt-5 space-y-3">
              {contact.offices.map((o) => (
                <div key={o.label} className="flex gap-2.5 text-sm">
                  <MapPin className="text-primary mt-0.5 size-4 shrink-0" />
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">{o.label}</span>
                    <br />
                    {o.line1}, {o.line2}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <FooterLinkColumns columns={COLUMNS} />

          {/* Get in touch */}
          <div className="col-span-2">
            <h3 className="text-sm font-semibold">Get in touch</h3>
            <ul className="text-muted-foreground mt-4 space-y-3 text-sm">
              <li>
                <a
                  href={`tel:${contact.phone}`}
                  className="hover:text-foreground flex items-center gap-2 transition-colors"
                >
                  <Phone className="size-4 shrink-0" /> {contact.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="hover:text-foreground flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                  <Mail className="size-4 shrink-0" /> {contact.email}
                </a>
              </li>
              <li className="flex items-center gap-2 whitespace-nowrap">
                <Clock className="size-4 shrink-0" /> {contact.hours}
              </li>
            </ul>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-muted-foreground hover:text-primary hover:border-primary/40 flex size-9 items-center justify-center rounded-full border transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <div className="text-muted-foreground flex items-center gap-5 text-sm">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-foreground transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
