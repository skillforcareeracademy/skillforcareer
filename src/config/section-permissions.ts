import { PERMISSIONS } from "./roles";

/**
 * Admin pages that belong to a PERMISSION rather than to a role.
 *
 * "maine yahan permissions me jaake aur permissions allow ki hain to wo
 * instructor panel me nhi dikh rhi. lead manage allow kiya to dikh nhi rha
 * unko unke panel me lead related kuch bhi … panel level pr permission nhi
 * change krni, mujhe bus user level pr permission change krni hai."
 *
 * Each of these pages already asks for its permission and nothing else —
 * `requirePermission(PERMISSIONS.MANAGE_LEADS)` and so on. Two gates in front
 * of them did not: the sidebar listed items by role, and the route guard let
 * people into /admin by role. So granting one person `leads:manage` changed
 * nothing they could see: no link, and a redirect away from the page before its
 * own check ever ran.
 *
 * This map is what both of those gates now consult, which is why it lives here
 * rather than in either of them — a path that is openable but invisible, or
 * visible but not openable, is worse than neither.
 *
 * Keys are paths UNDER /admin. A page that is role-only (Users, Companies) is
 * deliberately absent: it is not expressible as one permission, so it stays
 * exactly as restricted as it was.
 */
export const ADMIN_PATH_PERMISSION: Readonly<Record<string, string>> = {
  "/blog": PERMISSIONS.MANAGE_HOMEPAGE,
  "/board": PERMISSIONS.HOST_LIVE_CLASS,
  "/broadcasts": PERMISSIONS.SEND_BROADCAST,
  "/careers": PERMISSIONS.MANAGE_PLACEMENTS,
  "/chatbot": PERMISSIONS.MANAGE_HOMEPAGE,
  "/coupons": PERMISSIONS.MANAGE_PAYMENTS,
  "/curriculum": PERMISSIONS.MANAGE_CURRICULUM,
  "/holidays": PERMISSIONS.MANAGE_BATCHES,
  "/homepage": PERMISSIONS.MANAGE_HOMEPAGE,
  "/leads": PERMISSIONS.MANAGE_LEADS,
  "/media": PERMISSIONS.MANAGE_HOMEPAGE,
  "/offline": PERMISSIONS.HOST_LIVE_CLASS,
  "/pages": PERMISSIONS.MANAGE_HOMEPAGE,
  "/permissions": PERMISSIONS.MANAGE_ROLES,
  "/settings": PERMISSIONS.MANAGE_SETTINGS,
  "/terminology": PERMISSIONS.MANAGE_MATERIAL,
  "/wallets": PERMISSIONS.MANAGE_PAYMENTS,
  "/webinars": PERMISSIONS.HOST_LIVE_CLASS,
};

/**
 * The permission that opens an /admin path, or null when the path is not one of
 * these (and so stays role-only).
 *
 * `rest` is the part after /admin — "/leads", "/leads/42", "" for the home.
 * Matched by segment, so /leads/42 is covered by /leads while a future
 * /leads-export is not mistaken for it.
 */
export function permissionForAdminPath(rest: string): string | null {
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  const top = `/${path.split("/").filter(Boolean)[0] ?? ""}`;
  return ADMIN_PATH_PERMISSION[top] ?? null;
}
