"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Settings,
  User as UserIcon,
  Loader2,
  ChevronDown,
  LayoutDashboard,
  Compass,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";
import { ROLE_LABELS, ROLE_HOME, type Role } from "@/config/roles";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const [loading, setLoading] = useState(false);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const home = ROLE_HOME[user.role] ?? "/";
  // Profile and settings live at the panel root ("/admin/profile"), even for a
  // role whose home is deeper, like a sales agent's /admin/leads.
  const base = home.split("/").slice(0, 2).join("/") || "/";
  // Other panels this person can open through their other roles — an
  // instructor who is also studying switches to the learner panel here.
  const otherPanels = [...new Set((user.roles ?? []).map((r) => ROLE_HOME[r as Role]).filter(Boolean))]
    .filter((panelHome) => panelHome.split("/")[1] !== base.split("/")[1])
    .map((panelHome) => ({
      href: panelHome,
      label: ROLE_LABELS[(user.roles ?? []).find((r) => ROLE_HOME[r as Role] === panelHome) as Role],
    }));

  async function onLogout() {
    setLoading(true);
    await api.post("/api/auth/logout").catch(() => {});
    clear();
    toast.success("Signed out.");
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="focus-visible:ring-ring flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2" />
        }
        aria-label="Account menu"
      >
        <Avatar className="size-9">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
          <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="text-muted-foreground hidden size-4 sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        {/* Identity header */}
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar className="size-10 shrink-0">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-sm font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-tight font-semibold">{user.name}</p>
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
            <Badge variant="secondary" className="mt-1 h-4 px-1.5 text-[10px] font-medium">
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
          </div>
        </div>

        <DropdownMenuSeparator className="mx-0" />

        <DropdownMenuItem render={<Link href={home} />} className="gap-2.5 py-2">
          <LayoutDashboard className="text-muted-foreground size-4" />
          Dashboard
        </DropdownMenuItem>
        {otherPanels.map((panel) => (
          <DropdownMenuItem key={panel.href} render={<Link href={panel.href} />} className="gap-2.5 py-2">
            <ArrowLeftRight className="text-muted-foreground size-4" />
            Switch to {panel.label} panel
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem render={<Link href={`${base}/profile`} />} className="gap-2.5 py-2">
          <UserIcon className="text-muted-foreground size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`${base}/settings`} />} className="gap-2.5 py-2">
          <Settings className="text-muted-foreground size-4" />
          Settings
        </DropdownMenuItem>
        {/* The tour only auto-runs once; this is how anyone gets it back.
            A window event rather than lifted state — the tour lives at the
            other end of the shell, and neither needs to know about the other. */}
        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new Event("sfc:start-tour"))}
          className="gap-2.5 py-2"
        >
          <Compass className="text-muted-foreground size-4" />
          Replay panel tour
        </DropdownMenuItem>

        <DropdownMenuSeparator className="mx-0" />

        <DropdownMenuItem
          onClick={onLogout}
          disabled={loading}
          className="text-destructive focus:text-destructive gap-2.5 py-2"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
