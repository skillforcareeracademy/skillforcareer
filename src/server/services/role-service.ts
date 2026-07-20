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
