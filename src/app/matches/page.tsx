import { isDbConfigured, listMatches, type StoredMatch } from "@/lib/db";
import { getChampionIconMap, getDdragonVersion } from "@/lib/ddragon";
import MatchSyncForm from "@/components/MatchSyncForm";
import MatchesList from "@/components/MatchesList";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "战绩 · FZL Gaming",
};

export default async function MatchesPage() {
  const dbReady = isDbConfigured();
  const [matches, version, championMap] = await Promise.all([
    dbReady ? listMatches(100) : Promise.resolve([] as StoredMatch[]),
    getDdragonVersion(),
    getChampionIconMap(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-4 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
          Match History
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">战绩</h1>
      </div>

      <div className="mb-10">
        <MatchSyncForm />
      </div>

      {!dbReady ? (
        <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
          数据库还没接好（本地开发环境没有 POSTGRES_URL）。部署到 Vercel 并接上 Postgres 存储后，这里会显示同步下来的战绩。
        </p>
      ) : matches.length === 0 ? (
        <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
          还没有同步过战绩，粘贴 token 点一下同步吧。
        </p>
      ) : (
        <MatchesList matches={matches} version={version} championMap={championMap} />
      )}
    </div>
  );
}
