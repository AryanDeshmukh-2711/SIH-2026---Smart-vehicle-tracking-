import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './password.ts';

/**
 * Staff credentials. These tests are less about Argon2 working — it does — than
 * about this wrapper never failing open: a malformed stored hash must read as
 * "wrong password", not throw.
 */

describe('hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('shimla-depot-2026');
    expect(await verifyPassword('shimla-depot-2026', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('shimla-depot-2026');
    expect(await verifyPassword('shimla-depot-2025', hash)).toBe(false);
  });

  it('never stores the password in the hash', async () => {
    const hash = await hashPassword('correct-horse-battery-1');
    expect(hash).not.toContain('correct-horse-battery-1');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-1'), hashPassword('same-password-1')]);
    expect(a).not.toBe(b);
    // Both still verify — the salt travels inside the encoded hash.
    expect(await verifyPassword('same-password-1', a)).toBe(true);
    expect(await verifyPassword('same-password-1', b)).toBe(true);
  });

  it('returns false rather than throwing on a corrupt stored hash', async () => {
    // A 500 here would tell an attacker this particular account is unusual.
    for (const junk of ['', 'not-a-hash', '$argon2id$broken', '$2b$10$bcrypt-style']) {
      await expect(verifyPassword('anything', junk)).resolves.toBe(false);
    }
  });

  it('is case sensitive', async () => {
    const hash = await hashPassword('MixedCase-99');
    expect(await verifyPassword('mixedcase-99', hash)).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a reasonable staff password', () => {
    expect(passwordProblem('shimla-depot-2026')).toBeNull();
  });

  it('rejects short, letterless or digitless passwords', () => {
    expect(passwordProblem('short1')).toMatch(/10 characters/);
    expect(passwordProblem('1234567890')).toMatch(/letter/);
    expect(passwordProblem('abcdefghijk')).toMatch(/number/);
  });
});
