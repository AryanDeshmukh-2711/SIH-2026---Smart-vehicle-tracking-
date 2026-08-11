import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './tokens.ts';

/**
 * Access tokens are the only thing standing between an anonymous request and a
 * driver's controls, so the properties worth pinning are the ones an attacker
 * would probe: can it be forged, edited, or replayed after expiry.
 */

const driver = { id: 'usr_driver_1', role: 'driver' as const, name: 'Rakesh Thakur' };

describe('signing and verifying', () => {
  it('round-trips identity and role', async () => {
    const claims = await verifyAccessToken(await signAccessToken(driver));

    expect(claims?.sub).toBe(driver.id);
    expect(claims?.role).toBe('driver');
    expect(claims?.name).toBe(driver.name);
  });

  it('produces a compact three-part JWT', async () => {
    expect((await signAccessToken(driver)).split('.')).toHaveLength(3);
  });

  it('sets issuer, audience and an expiry', async () => {
    const claims = await verifyAccessToken(await signAccessToken(driver));

    expect(claims?.iss).toBe('himgati');
    expect(claims?.aud).toBe('himgati-api');
    expect(claims?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('does not carry a phone number or anything else sensitive', async () => {
    const token = await signAccessToken(driver);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    // A JWT payload is readable by anyone holding the token — it is signed, not
    // encrypted — so it must carry only what authorisation needs.
    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'name', 'role', 'sub'].sort(),
    );
  });
});

describe('rejecting bad tokens', () => {
  it('rejects a tampered payload', async () => {
    const token = await signAccessToken(driver);
    const [header, payload, signature] = token.split('.');

    // Promote driver to admin and re-encode — the signature no longer matches.
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    decoded.role = 'admin';
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    expect(await verifyAccessToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('rejects a token signed with a different key', async () => {
    // Header and payload are well-formed; only the signature is wrong.
    const token = await signAccessToken(driver);
    const [header, payload] = token.split('.');
    expect(await verifyAccessToken(`${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
  });

  it('rejects the "none" algorithm', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'usr_x', role: 'admin', iss: 'himgati', aud: 'himgati-api' }),
    ).toString('base64url');

    expect(await verifyAccessToken(`${header}.${payload}.`)).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    for (const junk of ['', 'garbage', 'a.b', 'a.b.c.d', '....']) {
      await expect(verifyAccessToken(junk)).resolves.toBeNull();
    }
  });
});
