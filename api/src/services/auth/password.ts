import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing for staff accounts.
 *
 * Argon2id, per the SRS. Parameters follow the OWASP baseline: 19 MiB of memory
 * and two passes, which is deliberately slow enough that a leaked hash table is
 * expensive to attack offline and fast enough that a desk login does not feel
 * sluggish.
 *
 * Passengers never have a password — they authenticate by OTP — so this is only
 * reached for depot managers, admins and the transport authority.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Never throws on a bad hash — a malformed stored value must read as "wrong
 * password", not as a 500 that tells an attacker the account is special.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain, OPTIONS);
  } catch {
    return false;
  }
}

/** Minimum viable policy for staff credentials. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return 'Password must be at least 10 characters';
  if (!/[a-z]/i.test(plain)) return 'Password must contain a letter';
  if (!/\d/.test(plain)) return 'Password must contain a number';
  return null;
}
