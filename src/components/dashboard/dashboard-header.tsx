"use client";

import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useUIStore } from "@/stores/ui-store";
import { DashboardBreadcrumbs } from "./dashboard-breadcrumbs";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import type { SessionUser } from "@/stores/auth-store";

export function DashboardHeader({ user }: { user: SessionUser }) {
  const openCommand = useUIStore((s) => s.setCommandOpen);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur-xl sm:px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 hidden h-6 md:block" />
      <DashboardBreadcrumbs />

      {/* Search — opens the command palette */}
      <button
        onClick={() => openCommand(true)}
        className="border-input bg-muted/40 text-muted-foreground hover:bg-muted ml-auto hidden h-9 items-center gap-2 rounded-lg border px-3 text-sm transition sm:flex md:w-64"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="bg-background text-muted-foreground pointer-events-none rounded border px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Search"
          onClick={() => openCommand(true)}
        >
          <Search className="size-5" />
        </Button>
        <NotificationBell />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
