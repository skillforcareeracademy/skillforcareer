import {
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from "@/config/roles";

/**
 * Authorization checks.
 *
 * A user's *effective* permissions come from the database at runtime (custom
 * roles, per-user overrides — Step 2). These helpers operate on an explicit
 * permission set so they stay pure and testable; `permissionsForRole` provides
 * the built-in defaults for seeding and for callers that only have a role.
 */
export function permissionsForRole(role: Role): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  granted: Iterable<Permission | string>,
  required: Permission,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(required);
}

export function hasAllPermissions(
  granted: Iterable<Permission | string>,
  required: Permission[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return required.every((p) => set.has(p));
}

export function hasAnyPermission(
  granted: Iterable<Permission | string>,
  required: Permission[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return required.some((p) => set.has(p));
}

export function roleHasPermission(role: Role, required: Permission): boolean {
  return hasPermission(permissionsForRole(role), required);
}
