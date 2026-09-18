import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Salted scrypt, no extra dependency (Node's crypto module is built in and
// works fine in Vercel's Node.js serverless runtime -- this route must not
// be switched to the edge runtime, which doesn't have it).
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const derived = Buffer.from(derivedHex, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  if (candidate.length !== derived.length) return false;
  return timingSafeEqual(candidate, derived);
}

// Plain (unhashed) constant-time comparison for the setup admin password --
// that one lives only in an env var (LEDGER_SETUP_ADMIN_PASSWORD), not the
// database, so there's no stored hash to check against.
export function verifyPlain(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
