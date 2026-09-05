"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useBranding } from "@/components/providers/branding-provider";
import { brandWordmark } from "@/lib/branding";
import { navFor, isNavActive } from "@/config/navigation";
import { ROLE_HOME, type Role } from "@/config/roles";
import { cn } from "@/lib/utils";

/** Role-aware, collapsible dashboard sidebar. */
export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const sections = navFor(role);
  const home = ROLE_HOME[role] ?? "/";
  const { logoUrl, siteName } = useBranding();
  const wordmark = brandWordmark(siteName);
  // Starts true so the client's wide lockup never flashes as a squashed square
  // on the way in; a square mark corrects itself on load.
  const [wide, setWide] = useState(true);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* The academy's own mark, not a generic cap glyph — "sfc ka logo lgao
            and Skill For Career space dekar likhe hone chahiye. Sab panel me ye
            hona chahiye." Whatever is uploaded under Settings → Branding shows
            here, in every panel, exactly as it does on the public site.

            The name is printed beside the mark only when the mark is roughly
            square. The academy's own logo is a 660×181 lockup that already
            *contains* "SKILL FOR CAREER", so setting it next to the words again
            both duplicates them and squashes the artwork into an unreadable
            32px square — which is exactly how it first rendered. A square mark
            (the other thing an admin might upload) still gets its wordmark. */}
        <Link
          href={home}
          className="flex h-10 items-center gap-2 px-1.5"
          aria-label={wordmark}
        >
          {/* Not next/image: the logo is replaceable at runtime, so its host and
              intrinsic size aren't known at build time. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={wordmark}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalHeight > 0) {
                setWide(img.naturalWidth / img.naturalHeight > 1.8);
              }
            }}
            className={cn(
              "h-8 shrink-0 object-contain object-left",
              wide
                ? "w-auto max-w-[10.5rem] group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:object-cover"
                : "w-8 rounded-lg",
            )}
          />
          {!wide && (
            <span className="truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              {wordmark}
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isNavActive(pathname, item.href)}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
