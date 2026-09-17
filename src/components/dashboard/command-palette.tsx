"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navFor, type NavFeature, type NavItem } from "@/config/navigation";
import { useUIStore } from "@/stores/ui-store";
import type { Role } from "@/config/roles";

/** ⌘K / Ctrl-K command palette — jump to any dashboard page or action. */
export function CommandPalette({
  role,
  features,
}: {
  role: Role;
  features?: readonly NavFeature[];
}) {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const toggle = useUIStore((s) => s.toggleCommand);
  const router = useRouter();
  const sections = navFor(role, features);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // Another product (Coding Practice) opens in its own tab, as it does from
  // the sidebar.
  const select = (item: NavItem) => {
    if (!item.external) return go(item.href);
    setOpen(false);
    window.open(item.href, "_blank", "noopener");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.label} heading={section.label}>
            {section.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`${section.label} ${item.title}`}
                onSelect={() => select(item)}
              >
                <item.icon className="size-4" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem value="homepage landing site" onSelect={() => go("/")}>
            <Home className="size-4" />
            Go to homepage
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
