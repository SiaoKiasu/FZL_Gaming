import { isDbConfigured, listMatches, type StoredMatch } from "@/lib/db";
import MatchSyncForm from "@/components/MatchSyncForm";
import Pill from "@/components/Pill";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "战绩 · FZL Gaming",
};

const POSITION_ORDER: Record<string, number> = {
  TOP: 0,
  JUNGLE: 1,
  MIDDLE: 2,
  BOTTOM: 3,
  UTILITY: 4,
};

function formatTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TeamBlock({ label, win, players }: { label: string; win: boolean; players: StoredMatch["players"] }) {
  const sorted = [...players].sort(
    (a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9)
  );
  return (
    <div className="flex-1 min-w-0">
      <p
        className={`font-display text-xs font-bold uppercase tracking-wider ${
          win ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"
        }`}
      >
        {label} · {win ? "胜利" : "失败"}
      </p>
      <table className="mt-2 w-full border-collapse text-xs">
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.playerName}
              className={`border-b border-[var(--border)]/50 last:border-0 ${
                p.member ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {p.member || p.playerName.split("#")[0]}
                {p.award ? (
                  <Pill tone={p.award === "MVP" ? "good" : "warning"}>{p.award}</Pill>
                ) : null}
              </td>
              <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--muted)]">{p.champion}</td>
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {p.kills}/{p.deaths}/{p.assists}
              </td>
              <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--muted)]">
                {p.score !== null ? p.score.toFixed(1) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ match }: { match: StoredMatch }) {
  const teamA = match.players.filter((p) => p.teamId === 100);
  const teamB = match.players.filter((p) => p.teamId === 200);
  const win = teamA[0]?.win ?? true;
  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          {formatTime(match.gameCreationMs)} · {match.queueName} · {match.durationMin} 分钟
        </p>
        <p className="text-xs text-[var(--muted)]">车队 {match.rosterCount} 人同队</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <TeamBlock label="蓝色方" win={win} players={teamA} />
        <TeamBlock label="红色方" win={!win} players={teamB} />
      </div>
    </div>
  );
}

export default async function MatchesPage() {
  const dbReady = isDbConfigured();
  const matches = dbReady ? await listMatches(100) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-4 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
          Match History
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">战绩</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          车队全员的排位战绩（2026-09-16 起），任何一个人的 token 都能同步全队
        </p>
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
        <div className="space-y-4">
          {matches.map((m) => (
            <MatchCard key={m.gameId} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
