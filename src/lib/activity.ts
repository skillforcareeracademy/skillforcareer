/**
 * The activity vocabulary, kept client-safe.
 *
 * The admin table renders these labels in the browser, so they can't live
 * beside the Prisma queries that write the rows — importing the service into a
 * client component drags the database client into the bundle. Same split as
 * `lib/branding` and `lib/validations/*`: the shapes and the constants here,
 * the reads and writes in `server/services/activity-service`.
 */

/** The verbs the platform records. A closed set so the admin filter can offer
 *  them and a typo can't invent a new one. */
export const ACTIVITY_ACTIONS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  REGISTER: "auth.register",
  ENROLL: "course.enroll",
  LESSON_VIEW: "lesson.view",
  LESSON_COMPLETE: "lesson.complete",
  LESSON_DOWNLOAD: "lesson.download",
  COURSE_COMPLETE: "course.complete",
  QUIZ_SUBMIT: "quiz.submit",
  ASSIGNMENT_SUBMIT: "assignment.submit",
  PAYMENT: "payment.paid",
  LIVE_JOIN: "live.join",
  WEBINAR_REGISTER: "webinar.register",
  NOTE_ADD: "note.add",
  CERTIFICATE: "certificate.issued",
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];

/** Human labels for the same set — used by the admin table and the timeline. */
export const ACTIVITY_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.register": "Created an account",
  "course.enroll": "Enrolled in a course",
  "lesson.view": "Opened a lesson",
  "lesson.complete": "Completed a lesson",
  "lesson.download": "Downloaded course material",
  "course.complete": "Finished a course",
  "quiz.submit": "Submitted a quiz",
  "assignment.submit": "Submitted an assignment",
  "payment.paid": "Made a payment",
  "live.join": "Joined a live class",
  "webinar.register": "Registered for a webinar",
  "note.add": "Saved a note",
  "certificate.issued": "Earned a certificate",
};

export interface ActivityRow {
  id: string;
  action: string;
  label: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

export interface LoginSummary {
  lastLoginAt: string | null;
  logins7d: number;
  logins30d: number;
  totalLogins: number;
  activeDays30d: number;
}
