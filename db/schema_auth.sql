-- FZL Gaming 账号表。
-- Run once against the same Postgres database as db/schema.sql (Vercel
-- dashboard -> Storage -> your Postgres -> Query).
--
-- A dedicated table rather than more rows in app_settings: app_settings is
-- a singleton key/value store (it holds exactly one row, the ledger
-- password), and packing eight credentials into it as
-- "member_password:<昵称>" keys would make the schema stop describing
-- itself and leave nowhere to hang a last-login column or an index later.
--
-- There is no sign-up flow. The eight members are fixed in src/lib/roster.ts;
-- an admin seeds each initial password through /api/auth/admin/set-password
-- (guarded by AUTH_ADMIN_PASSWORD) and sends it privately, after which
-- members change it themselves from the login page. That same endpoint is
-- also the only way back in for someone who forgets theirs.

CREATE TABLE IF NOT EXISTS members (
  -- Roster nickname, same identifier used by match_players.member,
  -- signups.member and videos.member.
  nickname       TEXT PRIMARY KEY,
  -- Salted scrypt, produced by hashPassword() in src/lib/ledgerAuth.ts.
  -- Plaintext is never stored, logged or echoed back anywhere.
  password_hash  TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
