import "server-only";

import { sql } from "@vercel/postgres";

// Credential storage for the members table (db/schema_auth.sql). Only ever
// touches the hash -- plaintext passwords are compared in the route
// handlers via verifyPassword() and never written anywhere.

export async function getMemberPasswordHash(nickname: string): Promise<string | null> {
  try {
    const { rows } = await sql<{ password_hash: string }>`
      SELECT password_hash FROM members WHERE nickname = ${nickname}
    `;
    return rows[0]?.password_hash ?? null;
  } catch {
    // db/schema_auth.sql hasn't been run yet. Treated as "no password set",
    // the same way getLedgerEntries() treats its own pending migration, so
    // the login page renders an explanation instead of a stack trace.
    return null;
  }
}

export async function setMemberPassword(nickname: string, hash: string): Promise<void> {
  await sql`
    INSERT INTO members (nickname, password_hash) VALUES (${nickname}, ${hash})
    ON CONFLICT (nickname) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                         updated_at = now()
  `;
}

/** Which members have a password yet -- shown to the admin, never publicly. */
export async function listMembersWithPassword(): Promise<Set<string>> {
  try {
    const { rows } = await sql<{ nickname: string }>`SELECT nickname FROM members`;
    return new Set(rows.map((r) => r.nickname));
  } catch {
    return new Set();
  }
}
