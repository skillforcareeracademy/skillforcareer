import {
  LayoutDashboard,
  Users,
  BookOpen,
  Building2,
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
  FileText,
  Newspaper,
  Image as ImageIcon,
  CalendarCheck,
  Bot,
  Briefcase,
  PartyPopper,
  Stethoscope,
  type LucideIcon,
  Flag,
  Wallet,
  BookMarked,
  Share2,
  ClipboardCheck,
  IdCard,
  Library,
  BookA,
  PenLine,
  Megaphone,
  Trash2,
} from "lucide-react";
import { ROLES, type Role } from "./roles";

/** Nav items that only appear when something is switched on for the viewer. */
export type NavFeature = "codingPractice" | "curriculum";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. */
  roles: Role[];
  /** The href is used as-is (not role-prefixed) and opens in a new tab. */
  external?: boolean;
  /** Hidden unless the shell passes this feature to `navFor`. */
  feature?: NavFeature;
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
  ROLES.COMPANY_ADMIN,
];
/**
 * The academy's own staff, and the company admins who run a client company
 * inside the same panel. What a company admin sees through these is narrowed
 * to its own company by `companyScope`; what it must not see at all is listed
 * under `ACADEMY` instead.
 */
const STAFF: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COMPANY_ADMIN];
/**
 * The academy's own affairs: its public website, its platform settings, its
 * money and its catalogue-wide tools. A company admin has no business here,
 * and must not even learn that the academy is above it.
 */
const ACADEMY: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
/** Staff plus the sales agents who work the lead sheet. */
const SALES: Role[] = [...STAFF, ROLES.SALES_AGENT];
const TEACHING: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.INSTRUCTOR,
  ROLES.COMPANY_ADMIN,
];

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
      // A learner's own figures, course by course — printable, and the same
      // sheet the office downloads from their profile.
      {
        title: "Report card",
        href: "/report-card",
        icon: ClipboardCheck,
        roles: [ROLES.STUDENT],
      },
      // The onboarding form: address, documents, schooling, CV.
      {
        title: "My details",
        href: "/profile/details",
        icon: IdCard,
        roles: [ROLES.STUDENT],
      },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "Courses", href: "/courses", icon: BookOpen, roles: ALL },
      { title: "Categories", href: "/categories", icon: FolderTree, roles: ACADEMY },
      { title: "Batches", href: "/batches", icon: Layers, roles: TEACHING },
      { title: "My Learning", href: "/learning", icon: GraduationCap, roles: [ROLES.STUDENT] },
      { title: "Live Classes", href: "/live", icon: Video, roles: ALL },
      // The on-screen notepad for teaching; learners have no use for it.
      { title: "Board", href: "/board", icon: PenLine, roles: TEACHING },
      { title: "Offline Classes", href: "/offline", icon: School, roles: ACADEMY },
      // Staff manage webinars here; learners get their own tab of the same
      // route showing what they're registered for and what's coming up.
      // Deliberately not instructors — there is no /instructor/webinars page,
      // and a nav link that lands on "coming soon" is worse than no link.
      {
        title: "Webinars",
        href: "/webinars",
        icon: Presentation,
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT],
      },
      // What a course covers, written by the academy. Instructors see it only
      // when an admin has granted them the permission.
      {
        title: "Curriculum",
        href: "/curriculum",
        icon: BookMarked,
        // Learners and staff always; an instructor only when an admin has
        // granted them `curriculum:manage` (the shell passes the feature).
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT],
      },
      {
        title: "Curriculum",
        href: "/curriculum",
        icon: BookMarked,
        roles: [ROLES.INSTRUCTOR],
        feature: "curriculum",
      },
      { title: "Assignments", href: "/assignments", icon: ClipboardList, roles: ALL },
      { title: "Quizzes", href: "/quizzes", icon: FileQuestion, roles: ALL },
      // Where a learner's "this question looks wrong" lands. Staff and the
      // course's own instructor answer it; learners hear back by email and in
      // their notifications, so they need no page of their own.
      {
        title: "Question reviews",
        href: "/quiz-reviews",
        icon: Flag,
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR],
      },
      // The separate practice product, signed in through the LMS. Switched on
      // and aimed at an audience under Settings → Coding Practice; the launch
      // route re-checks both, so this is only about who sees the link.
      {
        title: "Coding Practice",
        href: "/api/coding-practice/launch",
        icon: Stethoscope,
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT],
        external: true,
        feature: "codingPractice",
      },
      // The reading the academy sets: staff and instructors manage it, learners
      // read it and mark it up.
      {
        title: "Study material",
        href: "/materials",
        icon: Library,
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR, ROLES.STUDENT],
      },
      { title: "Terminology", href: "/terminology", icon: BookA, roles: ALL },
      { title: "Notes", href: "/notes", icon: NotebookPen, roles: [ROLES.STUDENT] },
      // Refer-and-earn pays into here, and this is where a learner asks for it.
      { title: "Wallet", href: "/wallet", icon: Wallet, roles: [ROLES.STUDENT] },
      { title: "Attendance", href: "/attendance", icon: CalendarCheck, roles: [ROLES.STUDENT] },
      { title: "Discussions", href: "/discussions", icon: MessageSquare, roles: ALL },
      { title: "Certificates", href: "/certificates", icon: Award, roles: ALL },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Homepage", href: "/homepage", icon: LayoutTemplate, roles: ACADEMY },
      { title: "Pages", href: "/pages", icon: FileText, roles: ACADEMY },
      { title: "Blog", href: "/blog", icon: Newspaper, roles: ACADEMY },
      { title: "Media", href: "/media", icon: ImageIcon, roles: ACADEMY },
      {
        title: "Companies",
        href: "/companies",
        icon: Building2,
        roles: [ROLES.SUPER_ADMIN],
      },
      { title: "Users", href: "/users", icon: Users, roles: STAFF },
      { title: "Leads", href: "/leads", icon: Target, roles: SALES },
      { title: "Careers", href: "/careers", icon: Briefcase, roles: ACADEMY },
      { title: "Holidays", href: "/holidays", icon: PartyPopper, roles: ACADEMY },
      { title: "Schedule", href: "/schedule", icon: CalendarClock, roles: TEACHING },
      // Refer and earn, as its own option: the rules, what it has paid, and
      // every referral. Wallets below is the payout side of the same money.
      { title: "Referral System", href: "/referrals", icon: Share2, roles: ACADEMY },
      { title: "Wallets", href: "/wallets", icon: Wallet, roles: ACADEMY },
      { title: "Payments", href: "/payments", icon: CreditCard, roles: STAFF },
      { title: "Fees", href: "/payments", icon: CreditCard, roles: [ROLES.STUDENT] },
      { title: "Broadcast", href: "/broadcasts", icon: Megaphone, roles: TEACHING },
      { title: "Activity", href: "/activity", icon: Activity, roles: ACADEMY },
      { title: "Assistant", href: "/chatbot", icon: Bot, roles: ACADEMY },
      { title: "Coupons", href: "/coupons", icon: Ticket, roles: ACADEMY },
      { title: "Roles", href: "/permissions", icon: KeyRound, roles: [ROLES.SUPER_ADMIN] },
      { title: "Recycle bin", href: "/recycle-bin", icon: Trash2, roles: ALL },
      { title: "Settings", href: "/settings", icon: Settings, roles: ACADEMY },
    ],
  },
];

const ROLE_BASE: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  INSTRUCTOR: "/instructor",
  STUDENT: "/student",
  SALES_AGENT: "/admin",
  COMPANY_ADMIN: "/admin",
};

/**
 * Resolve the navigation for a role with absolute, role-prefixed hrefs.
 * `features` lists what is switched on for this viewer; items gated on anything
 * else are left out.
 */
export function navFor(role: Role, features: readonly NavFeature[] = []): NavSection[] {
  const base = ROLE_BASE[role];
  return NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => item.roles.includes(role))
      .filter((item) => !item.feature || features.includes(item.feature))
      .map((item) => ({ ...item, href: item.external ? item.href : `${base}${item.href}` })),
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
