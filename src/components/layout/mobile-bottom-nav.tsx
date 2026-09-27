"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Home,
  LayoutDashboard,
  LogIn,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The phone's bottom navigation on the public site.
 *
 * Above `sm` the header carries all of this; below it the header keeps only the
 * menu, the logo and one button, which left a visitor on a phone with no way to
 * sign in or reach WhatsApp — the academy's "navigation bottom nhi aa rha and
 * login signup ka button bhi nhi aa rha". Five destinations, thumb height, and
 * the current one marked.
 */
interface Item {
  href: string;
  label: string;
  icon: typeof Home;
  /** WhatsApp leaves the site. */
  external?: boolean;
}

export function MobileBottomNav({
  signedIn,
  whatsappUrl,
  dashboardHref,
}: {
  signedIn: boolean;
  /** Null when the academy hasn't set a number — the button is then dropped. */
  whatsappUrl: string | null;
  dashboardHref: string;
}) {
  const pathname = usePathname();

  const items: Item[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/courses", label: "Courses", icon: BookOpen },
    ...(whatsappUrl
      ? [{ href: whatsappUrl, label: "WhatsApp", icon: MessageCircle, external: true }]
      : []),
    ...(signedIn
      ? [{ href: dashboardHref, label: "Dashboard", icon: LayoutDashboard }]
      : [
          { href: "/register", label: "Sign up", icon: UserPlus },
          { href: "/login", label: "Login", icon: LogIn },
        ]),
  ];

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    // `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the iPhone's
    // home indicator; the matching spacer below reserves the height so the
    // footer never ends up underneath it.
    <>
      <nav
        aria-label="Quick navigation"
        className="bg-background/95 border-border/60 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
      >
        <ul className="flex items-stretch justify-around">
          {items.map((item) => {
            const active = !item.external && isCurrent(item.href);
            const content = (
              <>
                <item.icon className="size-5" aria-hidden />
                <span className="text-[11px] leading-none font-medium">{item.label}</span>
              </>
            );
            return (
              <li key={item.label} className="flex-1">
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex min-h-14 flex-col items-center justify-center gap-1 py-2"
                  >
                    {content}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 py-2",
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div aria-hidden className="h-14 sm:hidden" />
    </>
  );
}
