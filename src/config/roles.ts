/**
 * Role-Based Access Control (RBAC) catalog.
 *
 * The build plan requires roles to be a full CRUD entity ("All Roles Custom"),
 * so at runtime a user's permissions come from the database (Role ⇄ Permission
 * join, Step 2). This file is the canonical *default* catalog: the source of
 * truth for seeding those tables and for compile-time typing of permission
 * checks. Custom roles created by admins layer on top of these.
 */

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  INSTRUCTOR: "INSTRUCTOR",
  STUDENT: "STUDENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  INSTRUCTOR: "Instructor",
  STUDENT: "Student",
};

/**
 * Permission catalog as `resource:action`. Grouping keeps the list auditable;
 * the union type gives autocomplete + compile-time safety at every call site.
 */
export const PERMISSIONS = {
  // Platform administration
  MANAGE_USERS: "users:manage",
  MANAGE_ROLES: "roles:manage",
  VIEW_ANALYTICS: "analytics:view",
  MANAGE_PAYMENTS: "payments:manage",
  MANAGE_SETTINGS: "settings:manage",
  MANAGE_HOMEPAGE: "homepage:manage",
  VIEW_REPORTS: "reports:view",
  MANAGE_LEADS: "leads:manage",

  // Catalog
  MANAGE_CATEGORIES: "categories:manage",
  CREATE_COURSE: "courses:create",
  UPDATE_ANY_COURSE: "courses:update:any",
  UPDATE_OWN_COURSE: "courses:update:own",
  DELETE_ANY_COURSE: "courses:delete:any",
  PUBLISH_COURSE: "courses:publish",
  VIEW_COURSE: "courses:view",

  // Batches & live classes
  MANAGE_BATCHES: "batches:manage",
  HOST_LIVE_CLASS: "live:host",
  JOIN_LIVE_CLASS: "live:join",

  // Learning
  ENROLL_COURSE: "enrollments:create",
  SUBMIT_ASSIGNMENT: "assignments:submit",
  GRADE_ASSIGNMENT: "assignments:grade",
  TAKE_QUIZ: "quiz:take",
  MANAGE_QUIZ: "quiz:manage",
  ISSUE_CERTIFICATE: "certificates:issue",
  VIEW_OWN_CERTIFICATE: "certificates:view:own",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** Default permission grants per built-in role (seed data for Step 2). */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: Object.values(P), // full access
  ADMIN: [
    P.MANAGE_USERS,
    P.VIEW_ANALYTICS,
    P.MANAGE_PAYMENTS,
    P.MANAGE_HOMEPAGE,
    P.VIEW_REPORTS,
    P.MANAGE_LEADS,
    P.MANAGE_CATEGORIES,
    P.CREATE_COURSE,
    P.UPDATE_ANY_COURSE,
    P.DELETE_ANY_COURSE,
    P.PUBLISH_COURSE,
    P.VIEW_COURSE,
    P.MANAGE_BATCHES,
    P.HOST_LIVE_CLASS,
    P.MANAGE_QUIZ,
    P.GRADE_ASSIGNMENT,
    P.ISSUE_CERTIFICATE,
  ],
  INSTRUCTOR: [
    P.CREATE_COURSE,
    P.UPDATE_OWN_COURSE,
    P.PUBLISH_COURSE,
    P.VIEW_COURSE,
    P.MANAGE_BATCHES,
    P.HOST_LIVE_CLASS,
    P.MANAGE_QUIZ,
    P.GRADE_ASSIGNMENT,
    P.ISSUE_CERTIFICATE,
    P.VIEW_ANALYTICS,
  ],
  STUDENT: [
    P.VIEW_COURSE,
    P.ENROLL_COURSE,
    P.JOIN_LIVE_CLASS,
    P.SUBMIT_ASSIGNMENT,
    P.TAKE_QUIZ,
    P.VIEW_OWN_CERTIFICATE,
  ],
};

/** Which dashboard home a role lands on after login. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  INSTRUCTOR: "/instructor",
  STUDENT: "/student",
};
