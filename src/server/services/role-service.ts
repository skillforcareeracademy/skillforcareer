import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  users: number;
  permissionKeys: string[];
}

export async function listRolesWithPermissions(): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      permissions: { include: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    isSystem: r.isSystem,
    users: r._count.users,
    permissionKeys: r.permissions.map((p) => p.permission.key),
  }));
}

export interface PermissionGroup {
  group: string;
  items: { key: string; description: string }[];
}

export async function permissionCatalog(): Promise<PermissionGroup[]> {
  const perms = await prisma.permission.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
  const map = new Map<string, { key: string; description: string }[]>();
  for (const p of perms) {
    const list = map.get(p.group) ?? [];
    list.push({ key: p.key, description: p.description ?? p.key });
    map.set(p.group, list);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

export async function setRolePermissions(roleId: string, keys: string[]): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw AppError.notFound("Role not found.");
  const perms = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
    }),
  ]);
}

function toSlug(name: string): string {
  return (
    name.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "ROLE"
  );
}

export async function createRole(name: string, description?: string): Promise<string> {
  let slug = toSlug(name);
  for (let n = 2; ; n += 1) {
    const clash = await prisma.role.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${toSlug(name)}_${n}`;
  }
  const role = await prisma.role.create({
    data: { name, slug, description: description || null, isSystem: false },
    select: { id: true },
  });
  return role.id;
}

export async function deleteRole(id: string): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) throw AppError.notFound("Role not found.");
  if (role.isSystem) throw AppError.badRequest("Built-in roles can't be deleted.");
  if (role._count.users > 0) throw AppError.badRequest("Reassign this role's users before deleting it.");
  await prisma.rolePermission.deleteMany({ where: { roleId: id } });
  await prisma.role.delete({ where: { id } });
}

// ── One person's own permissions ───────────────────────────────────────────

export interface UserPermissionOverride {
  key: string;
  allow: boolean;
}

export interface UserPermissionView {
  user: { id: string; name: string; email: string; roleName: string };
  /** What the person's roles already give them, before any override. */
  fromRole: string[];
  overrides: UserPermissionOverride[];
}

/**
 * What one person may do, and why.
 *
 * The screen needs all three: what the role gives, what was added for them
 * alone, and what was taken away — otherwise a tick box cannot say whether it
 * is ticked because of the role or because of this person.
 */
export async function getUserPermissions(
  userId: string,
): Promise<UserPermissionView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } },
      extraRoles: {
        select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
      },
      extraPermissions: {
        select: { allow: true, permission: { select: { key: true } } },
      },
    },
  });
  if (!user) throw AppError.notFound("User not found.");

  const fromRole = new Set(user.role.permissions.map((rp) => rp.permission.key));
  for (const extra of user.extraRoles) {
    for (const rp of extra.role.permissions) fromRole.add(rp.permission.key);
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleName: user.role.name,
    },
    fromRole: [...fromRole],
    overrides: user.extraPermissions.map((up) => ({
      key: up.permission.key,
      allow: up.allow,
    })),
  };
}

/**
 * Replace one person's overrides.
 *
 * Sent as a whole set rather than one tick at a time: the screen knows the
 * final state, and replacing it means a half-failed save cannot leave someone
 * holding a permission nobody meant to give them. An override matching what
 * the role already says is dropped rather than stored — keeping it would
 * silently freeze that person's access when the role later changes.
 */
export async function setUserPermissions(
  userId: string,
  overrides: UserPermissionOverride[],
): Promise<void> {
  const view = await getUserPermissions(userId);
  const fromRole = new Set(view.fromRole);

  const meaningful = overrides.filter((o) =>
    o.allow ? !fromRole.has(o.key) : fromRole.has(o.key),
  );

  const perms = meaningful.length
    ? await prisma.permission.findMany({
        where: { key: { in: meaningful.map((o) => o.key) } },
        select: { id: true, key: true },
      })
    : [];
  const idFor = new Map(perms.map((p) => [p.key, p.id]));

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    ...meaningful
      .filter((o) => idFor.has(o.key))
      .map((o) =>
        prisma.userPermission.create({
          data: { userId, permissionId: idFor.get(o.key)!, allow: o.allow },
        }),
      ),
  ]);
}
