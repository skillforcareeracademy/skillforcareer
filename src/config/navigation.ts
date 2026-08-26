import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  Layers,
  Video,
  ClipboardList,
  FileQuestion,
  Award,
  CreditCard,
  BarChart3,
  Settings,
  FolderTree,
  CalendarClock,
  MessageSquare,
  Target,
  Ticket,
  Activity,
  Presentation,
  LayoutTemplate,
  NotebookPen,
  KeyRound,
  School,
  type LucideIcon,
} from "lucide-react";
import { ROLES, type Role } from "./roles";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. */
  roles: Role[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const ALL: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.INSTRUCTOR,
  ROLES.STUDENT,
];
const STAFF: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
const TEACHING: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR];

/**
 * Single source of truth for sidebar navigation across every dashboard.
 * `hrefs` are role-relative so the same catalog drives /admin, /instructor and
 * /student shells; filter with `navFor(role)`.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "", icon: LayoutDashboard, roles: ALL },
      { title: "Analytics", href: "/analytics", icon: BarChart3, roles: STAFF },
      { title: "Performance", href: "/performance", icon: Activity, roles: TEACHING },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "Courses", href: "/courses", icon: BookOpen, roles: ALL },
      { title: "Categories", href: "/categories", icon: FolderTree, roles: STAFF },
      { title: "Batches", href: "/batches", icon: Layers, roles: TEACHING },
      { title: "My Learning", href: "/learning", icon: GraduationCap, roles: [ROLES.STUDENT] },
      { title: "Live Classes", href: "/live", icon: Video, roles: ALL },
      { title: "Offline Classes", href: "/offline", icon: School, roles: STAFF },
      { title: "Webinars", href: "/webinars", icon: Presentation, roles: STAFF },
      { title: "Assignments", href: "/assignments", icon: ClipboardList, roles: ALL },
      { title: "Quizzes", href: "/quizzes", icon: FileQuestion, roles: ALL },
      { title: "Notes", href: "/notes", icon: NotebookPen, roles: [ROLES.STUDENT] },
      { title: "Discussions", href: "/discussions", icon: MessageSquare, roles: ALL },
      { title: "Certificates", href: "/certificates", icon: Award, roles: ALL },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Homepage", href: "/homepage", icon: LayoutTemplate, roles: STAFF },
      { title: "Users", href: "/users", icon: Users, roles: STAFF },
      { title: "Leads", href: "/leads", icon: Target, roles: STAFF },
      { title: "Schedule", href: "/schedule", icon: CalendarClock, roles: TEACHING },
      { title: "Payments", href: "/payments", icon: CreditCard, roles: STAFF },
      { title: "Coupons", href: "/coupons", icon: Ticket, roles: STAFF },
      { title: "Roles", href: "/permissions", icon: KeyRound, roles: [ROLES.SUPER_ADMIN] },
      { title: "Settings", href: "/settings", icon: Settings, roles: ALL },
    ],
  },
];

const ROLE_BASE: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  INSTRUCTOR: "/instructor",
  STUDENT: "/student",
};

/** Resolve the navigation for a role with absolute, role-prefixed hrefs. */
export function navFor(role: Role): NavSection[] {
  const base = ROLE_BASE[role];
  return NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => item.roles.includes(role))
      .map((item) => ({ ...item, href: `${base}${item.href}` })),
  })).filter((section) => section.items.length > 0);
}

/** Flattened nav items for a role (used by the mobile bottom nav). */
export function flatNavFor(role: Role): NavItem[] {
  return navFor(role).flatMap((s) => s.items);
}

/** True when `href` is the active route for `pathname` (exact for role home). */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const depth = href.split("/").filter(Boolean).length;
  return depth > 1 && pathname.startsWith(`${href}/`);
}
