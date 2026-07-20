import bcrypt from "bcryptjs";

/**
 * Password hashing. bcryptjs is pure-JS (no native build step) and runs in any
 * Node runtime.
 *
 * Cost 10 (the bcrypt default, and OWASP's current floor) rather than 12: on
 * this hardware 12 costs ~275ms of blocking CPU per sign-in against ~70ms at
 * 10, and that 200ms sat on the critical path of every login. Hashes carry
 * their own cost, so existing 12-round hashes still verify — `needsRehash`
 * lets the login path upgrade them in place.
 */
const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** True when `hash` was produced at a different cost than we now use. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== SALT_ROUNDS;
  } catch {
    return false; // unreadable hash — leave it alone
  }
}
