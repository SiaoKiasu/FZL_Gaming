import type { NextConfig } from "next";

// With LOCAL_PG=1 (set only by `npm run dev:local`), imports of
// @vercel/postgres are redirected to a pg-backed stand-in, so the app can
// run against a plain local Postgres -- see src/lib/localPostgres.ts for
// why that's necessary at all. Any other invocation, including every
// production build, resolves @vercel/postgres normally.
const useLocalPostgres = process.env.LOCAL_PG === "1";

const nextConfig: NextConfig = {
  ...(useLocalPostgres
    ? {
        turbopack: {
          resolveAlias: {
            "@vercel/postgres": "./src/lib/localPostgres.ts",
          },
        },
      }
    : {}),
};

export default nextConfig;
