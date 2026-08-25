/** App-wide constants. Keep magic numbers/strings here, not inline. */

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 12,
  MAX_PAGE_SIZE: 100,
} as const;

export const UPLOAD = {
  MAX_IMAGE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_VIDEO_BYTES: 2 * 1024 * 1024 * 1024, // 2 GB
  MAX_DOC_BYTES: 25 * 1024 * 1024, // 25 MB
  ACCEPTED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  ACCEPTED_DOC_TYPES: ["application/pdf"],
  ACCEPTED_VIDEO_TYPES: ["video/mp4", "video/webm"],
} as const;

export const VIDEO = {
  PLAYBACK_SPEEDS: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const,
  /** How often (ms) to persist watch progress while playing. */
  PROGRESS_SAVE_INTERVAL_MS: 10_000,
  /** Fraction of a lesson watched before it counts as complete. */
  COMPLETION_THRESHOLD: 0.9,
} as const;

export const QUERY_KEYS = {
  DASHBOARD: "dashboard",
  COURSES: "courses",
  USERS: "users",
  ENROLLMENTS: "enrollments",
} as const;

export const ROUTES = {
  home: "/",
  courses: "/courses",
  contact: "/contact",
  webinars: "/webinars",
  login: "/login",
  register: "/register",
  verifyOtp: "/verify-otp",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  admin: "/admin",
  instructor: "/instructor",
  student: "/student",
} as const;
