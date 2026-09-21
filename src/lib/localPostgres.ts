import "server-only";

import { Pool, type PoolClient } from "pg";

// Stand-in for @vercel/postgres, used only when developing against a plain
// local Postgres (e.g. `brew install postgresql@17`).
//
// Why it has to exist: @vercel/postgres talks Neon's proprietary
// SQL-over-HTTP protocol, not the Postgres wire protocol. Point it at a
// local server and it doesn't even try to connect -- it rejects the
// connection string outright ("format for `neon()` should be ..."). So
// local development either needs a cloud database, or this.
//
// Nothing imports this file by name. next.config.ts rewrites imports of
// "@vercel/postgres" to point here, and only when LOCAL_PG=1 is set (which
// only `npm run dev:local` does). Production builds never see it, and
// src/lib/db.ts and src/lib/videos.ts are untouched by any of this.
//
// Only the surface those two files actually use is implemented: the `sql`
// template tag, and `db.connect()` returning something with query/release
// for the transaction in insertGames().

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  }
  return pool;
}

// Turns sql`SELECT ... ${a} ... ${b}` into ("SELECT ... $1 ... $2", [a, b]).
// Values are always passed as bound parameters, never interpolated into the
// text, exactly as the real tag does.
function toQuery(strings: TemplateStringsArray, values: unknown[]) {
  let text = "";
  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < values.length) text += `$${i + 1}`;
  });
  return { text, values };
}

type QueryResult<T> = { rows: T[]; rowCount: number };

export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<T>> {
  const { text, values: params } = toQuery(strings, values);
  const result = await getPool().query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export const db = {
  connect(): Promise<PoolClient> {
    return getPool().connect();
  },
};

export type VercelPoolClient = PoolClient;
