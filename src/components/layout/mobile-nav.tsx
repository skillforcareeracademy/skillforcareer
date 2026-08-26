"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CourseSearch } from "@/components/shared/course-search";
import { cn } from "@/lib/utils";

export interface NavLink {
  label: string;
  href: string;
}

/**
 * The header's navigation on a phone.
 *
 * The links are admin-editable (Admin → Homepage → Header), so below the
 * desktop breakpoint they need somewhere to go — otherwise adding a link there
 * would quietly do nothing for the visitors most likely to be on a phone.
 */
export function MobileNav({
  links,
  showSearch,
}: {
  links: NavLink[];
  /** The header's own search box is hidden below `md`; offer it here instead. */
  showSearch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
            {links.map((link) => (
              <Link
                key={`${link.label}-${link.href}`}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "hover:bg-muted rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname === link.href ? "bg-muted text-foreground" : "text-foreground/80",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
