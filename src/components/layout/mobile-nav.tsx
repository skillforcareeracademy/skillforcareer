"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CourseSearch } from "@/components/shared/course-search";
import type { HeaderMenus } from "@/server/services/header-menu-service";
import { itemsFor, type HeaderLink } from "./header-nav";
import { cn } from "@/lib/utils";

/**
 * The header's navigation on a phone.
 *
 * The links are admin-editable (Admin → Homepage → Header), so below the
 * desktop breakpoint they need somewhere to go — otherwise adding a link there
 * would quietly do nothing for the visitors most likely to be on a phone.
 *
 * A link that drops down on desktop expands in place here: there is no hover on
 * a phone, so the caret has to be a real, tappable control separate from the
 * link itself.
 */
export function MobileNav({
  links,
  menus,
  showSearch,
}: {
  links: HeaderLink[];
  menus: HeaderMenus;
  /** The header's own search box is hidden below `md`; offer it here instead. */
  showSearch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();

  const close = () => setOpen(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-1 overflow-y-auto p-3">
            {showSearch && (
              <div className="mb-2 md:hidden">
                <CourseSearch />
              </div>
            )}

            {links.map((link) => {
              const key = `${link.label}-${link.href}`;
              const entries = itemsFor(link.menu, menus);
              const isOpen = expanded === key;

              const anchor = (
                <Link
                  href={link.href}
                  onClick={close}
                  className={cn(
                    "hover:bg-muted flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-muted text-foreground"
                      : "text-foreground/80",
                  )}
                >
                  {link.label}
                </Link>
              );

              if (entries.length === 0) {
                return (
                  <div key={key} className="flex">
                    {anchor}
                  </div>
                );
              }

              return (
                <div key={key}>
                  <div className="flex items-center">
                    {anchor}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${isOpen ? "Hide" : "Show"} ${link.label}`}
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </Button>
                  </div>

                  {isOpen && (
                    <ul className="border-border/70 mt-1 mb-1 ml-3 space-y-0.5 border-l pl-3">
                      {entries.map((entry) => (
                        <li key={entry.href}>
                          <Link
                            href={entry.href}
                            onClick={close}
                            className="text-foreground/75 hover:bg-muted hover:text-foreground block truncate rounded-md px-3 py-2 text-sm transition-colors"
                          >
                            {entry.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
