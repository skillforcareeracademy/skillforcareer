import type { Role } from "./roles";
import { ROLES } from "./roles";

/**
 * The guided walkthrough that runs the first time someone opens their panel —
 * "jaise hi panel khule tour guide and also voice guide honi chahiye".
 *
 * Steps are written to be read aloud as well as read, so they are full
 * sentences rather than UI labels. Each one points at a nav item by its href;
 * the tour highlights whatever is on screen and skips anything that isn't, so a
 * role without a given page simply doesn't hear about it.
 */

export interface TourStep {
  /** Nav href to spotlight. Omit for a step that talks about the panel itself. */
  href?: string;
  title: string;
  body: string;
}

const STUDENT_TOUR: TourStep[] = [
  {
    title: "Welcome to your learning panel",
    body: "This is where everything you've enrolled in lives. Let me show you around — it takes about a minute. You can stop any time.",
  },
  {
    href: "/student",
    title: "Your dashboard",
    body: "Your progress at a glance: what to pick up next, upcoming classes and anything that needs your attention.",
  },
  {
    href: "/student/learning",
    title: "My Learning",
    body: "Every course you're enrolled in, with how far through you are. Tap a course to carry on where you left off.",
  },
  {
    href: "/student/live",
    title: "Live classes",
    body: "Your scheduled live sessions. The join button appears here when a class starts, so you never need a separate link.",
  },
  {
    href: "/student/webinars",
    title: "Webinars",
    body: "Free masterclasses. See what you've registered for, what's coming up, what's running right now, and everything that's already happened.",
  },
  {
    href: "/student/assignments",
    title: "Assignments",
    body: "Work set by your instructors, with due dates and your marks once they're graded.",
  },
  {
    href: "/student/quizzes",
    title: "Quizzes",
    body: "Test yourself. Your best score and how many attempts you have left are shown on each quiz.",
  },
  {
    href: "/student/notes",
    title: "Notes and bookmarks",
    body: "Everything you've saved while studying, from every course, in one list.",
  },
  {
    href: "/student/attendance",
    title: "Attendance",
    body: "Your class register — which sessions you attended and your overall attendance percentage.",
  },
  {
    href: "/student/payments",
    title: "Fees and payments",
    body: "Your invoices, what's paid, and if you're on an instalment plan, exactly what's left and when it's due.",
  },
  {
    href: "/student/certificates",
    title: "Certificates",
    body: "Awards you've earned. Each one has a verification code employers can check on our website.",
  },
  {
    title: "That's the tour",
    body: "You can replay this any time from the menu in the top right. If you get stuck, ask Ami — the chat button at the bottom of the screen.",
  },
];

const INSTRUCTOR_TOUR: TourStep[] = [
  {
    title: "Welcome to your teaching panel",
    body: "Everything you need to run your courses and cohorts. Here's a quick tour.",
  },
  {
    href: "/instructor/courses",
    title: "Your courses",
    body: "Build and edit your curriculum here. The Content access tab is where you decide which lessons open, when, and for whom.",
  },
  {
    href: "/instructor/batches",
    title: "Batches",
    body: "Your cohorts, their timetables and their learners.",
  },
  {
    href: "/instructor/live",
    title: "Live classes",
    body: "Schedule sessions and start the room. Attendance is taken automatically as learners join and leave.",
  },
  {
    href: "/instructor/assignments",
    title: "Assignments",
    body: "Set work for a whole batch or for named learners, then grade what comes back — all from one sheet.",
  },
  {
    href: "/instructor/quizzes",
    title: "Quizzes",
    body: "Build question papers, set how many attempts learners get, and hold a paper back until the day of the test.",
  },
  {
    href: "/instructor/certificates",
    title: "Certificates",
    body: "Issue completion and appreciation awards to learners who've earned them.",
  },
  {
    title: "That's the tour",
    body: "Replay it any time from the menu in the top right.",
  },
];

const ADMIN_TOUR: TourStep[] = [
  {
    title: "Welcome to the admin panel",
    body: "This runs the whole academy — the website, the courses, the money and the people. Here's the quick version.",
  },
  {
    href: "/admin",
    title: "Dashboard",
    body: "Live numbers: enrolments, revenue and what's happened today.",
  },
  {
    href: "/admin/courses",
    title: "Courses",
    body: "Create and publish programmes. Inside each course, the Content access tab controls which lessons a batch or a single learner can open.",
  },
  {
    href: "/admin/leads",
    title: "Leads",
    body: "Your enquiry pipeline — every callback request from the website lands here, ready to be worked through the stages.",
  },
  {
    href: "/admin/payments",
    title: "Payments",
    body: "Record fees, raise a payment link to send on WhatsApp, and set up instalment plans.",
  },
  {
    href: "/admin/webinars",
    title: "Webinars",
    body: "Schedule masterclasses, publish them to the website and take attendance from the live room.",
  },
  {
    href: "/admin/homepage",
    title: "Homepage",
    body: "Every band of the public site is editable here — including the header, the footer and the sign-in screen.",
  },
  {
    href: "/admin/chatbot",
    title: "Assistant",
    body: "Train Ami, the chat assistant on the website. Whatever visitors ask that Ami can't answer waits here for you to teach it.",
  },
  {
    href: "/admin/activity",
    title: "Activity",
    body: "Who signed in, when, and what they did — for every learner and every member of staff.",
  },
  {
    href: "/admin/settings",
    title: "Settings",
    body: "Branding, certificates, watch limits, EMI terms and the assistant's own switches.",
  },
  {
    title: "That's the tour",
    body: "Replay it any time from the menu in the top right.",
  },
];

export function tourFor(role: Role): TourStep[] {
  if (role === ROLES.STUDENT) return STUDENT_TOUR;
  if (role === ROLES.INSTRUCTOR) return INSTRUCTOR_TOUR;
  return ADMIN_TOUR;
}

/** Bumped when the steps change materially, so a returning user is shown it again. */
export const TOUR_VERSION = 1;

export function tourStorageKey(role: Role): string {
  return `sfc.tour.${role}.v${TOUR_VERSION}`;
}
