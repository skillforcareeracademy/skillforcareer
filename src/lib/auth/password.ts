import bcrypt from "bcryptjs";

/**
 * Password hashing. bcryptjs is pure-JS (no native build step) and runs in any
 * Node runtime. Cost factor 12 is a sensible 2026 default for interactive auth.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
