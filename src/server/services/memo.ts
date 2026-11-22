/**
 * A short-lived, process-wide value cache for reads that happen on every
 * request but change only when an admin saves.
 *
 * Why `globalThis` and not a module-level `let`: Next compiles route handlers
 * and pages into separate module graphs, so the same import is *two* module
 * instances at runtime. A plain `let` means the admin's `PATCH` clears the
 * route handler's copy while the page keeps serving its own — the save lands in
 * the database and the site doesn't move for a full TTL. Hanging the store off
 * `globalThis`, as `lib/prisma.ts` already does for the client, gives both
 * bundles the one object.
 *
 * Scope is one Node process: on a multi-instance deployment a save clears only
 * the instance that served it, and the others catch up within the TTL.
 */
interface Entry {
  value: unknown;
  expires: number;
}

const store = ((globalThis as { __memo?: Map<string, Entry> }).__memo ??= new Map());

export function readMemo<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeMemo<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function clearMemo(key: string): void {
  store.delete(key);
}

/**
 * Read-through cache: hand back the memoised value, or run `fn`, store it for
 * `ttlMs`, and return it. For the public pages' reads that happen on every
 * visit but change only when the office saves — a few minutes of staleness is
 * a fair trade for not querying a far-off database on every request, which is
 * what was dragging the landing page's response time down.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = readMemo<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  writeMemo(key, value, ttlMs);
  return value;
}
