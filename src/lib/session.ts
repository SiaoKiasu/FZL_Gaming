import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { roster } from "@/lib/roster";

// Stateless signed-cookie sessions. No session table: the cookie itself
// carries the nickname and the time it was issued, and an HMAC over both
// makes it unforgeable without SESSION_SECRET. Revoking a single session
// early isn't possible -- the trade for a team of eight is that there's no
// table to migrate, expire or clean up, and rotating SESSION_SECRET logs
// everyone out at once if that's ever needed.
//
// The cookie is httpOnly, so page scripts can't read it and an XSS bug
// can't exfiltrate it. sameSite=lax keeps it off cross-site POSTs, which
// is what stops another site from making a logged-in member rate a video
// or cancel a sign-up without their knowledge.

const COOKIE_NAME = "fzl_session";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

const KNOWN_MEMBERS = new Set(roster.map((p) => p.nickname));

export function isSessionConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function issue(nickname: string, key: string): string {
  const payload = Buffer.from(`${nickname}\n${Date.now()}`).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

/**
 * Returns the nickname a cookie value vouches for, or null if it doesn't
 * hold up. Every rejection path returns the same null -- a caller can't
 * tell a bad signature from an expired one from a retired nickname.
 */
export function verifySessionValue(value: string): string | null {
  const key = process.env.SESSION_SECRET;
  if (!key) return null;

  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const provided = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(payload, key));
  // Length has to match before timingSafeEqual, which throws on a mismatch.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const newline = decoded.indexOf("\n");
  if (newline < 0) return null;
  const nickname = decoded.slice(0, newline);
  const issuedAt = Number(decoded.slice(newline + 1));

  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE_SEC * 1000) return null;
  // A nickname that has since left roster.ts stops being a valid session,
  // even though its signature is still perfectly good.
  if (!KNOWN_MEMBERS.has(nickname)) return null;

  return nickname;
}

/**
 * The only source of identity in the app. Every route that used to read
 * `member` out of the request body reads it from here instead, which is
 * what makes impersonation impossible rather than merely discouraged.
 */
export async function getCurrentMember(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySessionValue(raw);
}

// Setting and clearing only work inside a Route Handler or Server Function
// -- cookies can't be written while a Server Component renders, since the
// response headers are already on their way by then.
export async function startSession(nickname: string): Promise<boolean> {
  const key = process.env.SESSION_SECRET;
  if (!key) return false;
  const store = await cookies();
  store.set(COOKIE_NAME, issue(nickname, key), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return true;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
