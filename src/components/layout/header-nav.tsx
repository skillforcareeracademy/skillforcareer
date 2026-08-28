"use client";

import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HeaderMenus } from "@/server/services/header-menu-service";
import type { HeaderMenuKind } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

export interface HeaderLink {
  label: string;
  href: string;
  menu: HeaderMenuKind;
}

const linkClass =
  "text-foreground/70 hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors";

/**
 * The desktop navigation.
 *
 * A link may carry a dropdown of the live catalogue — courses or categories —
 * chosen per link under Admin → Homepage → Header. The trigger is still a real
 * link: clicking "Courses" goes to the catalogue, hovering it shows the shortcut
 * list. That matters on touch, where there is no hover to rely on.
 */
export function HeaderNav({ links, menus }: { links: HeaderLink[]; menus: HeaderMenus }) {
  return (
    <nav className="hidden items-center gap-0.5 lg:flex">
      {links.map((item) => {
        const entries = itemsFor(item.menu, menus);
        const key = `${item.label}-${item.href}`;

        if (entries.length === 0) {
          return (
            <Link key={key} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          );
        }

        return (
          <DropdownMenu key={key}>
            <DropdownMenuTrigger
              openOnHover
              delay={80}
              closeDelay={120}
              // The trigger is a real link, not a button — "Courses" has to go
              // to the catalogue on click and on touch, where there is no
              // hover. Base UI needs telling, or it warns that a component
              // acting as a button isn't one.
              nativeButton={false}
              // `render` rather than `asChild` — this is Base UI, not Radix.
              render={<Link href={item.href} className={linkClass} />}
            >
              {item.label}
              <ChevronDown
                className="size-3.5 opacity-60 transition-transform data-popup-open:rotate-180"
                aria-hidden
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="start"
              sideOffset={6}
              // The trigger is a short word, and `w-(--anchor-width)` on the
              // shared content would squeeze the list to its width.
              className="w-auto min-w-72 p-1.5"
            >
              <ul className="grid gap-0.5">
                {entries.map((entry) => (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      className="hover:bg-muted focus-visible:bg-muted group flex items-center justify-between gap-4 rounded-md px-2.5 py-2 text-sm outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{entry.title}</span>
                        {entry.meta && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {entry.meta}
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href={item.href}
                className={cn(
                  "text-primary mt-1 flex items-center gap-1 rounded-md border-t px-2.5 pt-2.5 pb-1.5 text-sm font-semibold",
                  "hover:underline",
                )}
              >
                {item.menu === "categories" ? "Browse all categories" : "See all courses"}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

/** One row of a dropdown, whichever list it was built from. */
export interface MenuEntry {
  title: string;
  href: string;
  meta: string | null;
}

/** The rows a link's chosen dropdown shows — empty means "render a plain link". */
export function itemsFor(kind: HeaderMenuKind, menus: HeaderMenus): MenuEntry[] {
  if (kind === "categories") {
    return menus.categories.map((c) => ({
      title: c.name,
      href: `/courses?category=${c.slug}`,
      meta: `${c.courseCount} course${c.courseCount === 1 ? "" : "s"}`,
    }));
  }
  if (kind === "courses") {
    return menus.courses.map((c) => ({
      title: c.title,
      href: `/courses/${c.slug}`,
      meta: c.categoryName,
    }));
  }
  return [];
}
