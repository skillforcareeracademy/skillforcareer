"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { flatNavFor, isNavActive } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/config/roles";

/** Fixed bottom navigation for mobile (first few role nav items). */
export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = flatNavFor(role).slice(0, 5);

  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 flex border-t backdrop-blur-xl md:hidden">
      {items.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="max-w-full truncate px-1">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
