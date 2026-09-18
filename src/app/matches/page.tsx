import Link from "next/link";
import { isDbConfigured, listMatches, type StoredMatch, type StoredPlayer } from "@/lib/db";
import { getDdragonVersion, itemIconUrl, parseItemIds } from "@/lib/ddragon";
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

const POSITION_LABEL: Record<string, string> = {
  TOP: "上单",
  JUNGLE: "打野",
  MIDDLE: "中单",
  BOTTOM: "下路",
  UTILITY: "辅助",
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

function ItemStrip({ items, version }: { items: string; version: string }) {
  const ids = parseItemIds(items);
  return (
    <div className="flex gap-0.5">
      {ids.map((id, i) => {
        const url = itemIconUrl(version, id);
        return url ? (
          <img
            key={i}
            src={url}
            alt=""
            width={18}
            height={18}
            className="rounded-[2px] border border-[var(--border)]"
          />
        ) : null;
      })}
    </div>
  );
}

function TeamBlock({
  label,
  win,
  players,
  version,
}: {
  label: string;
  win: boolean;
  players: StoredPlayer[];
  version: string;
}) {
  const sorted = [...players].sort(
    (a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9)
  );
  return (
    <div
      className={`flex-1 min-w-0 border-l-2 pl-4 ${
        win ? "border-[var(--status-good)]/60" : "border-[var(--status-critical)]/60"
      }`}
    >
      <p
        className={`font-display text-xs font-bold uppercase tracking-wider ${
          win ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"
        }`}
      >
        {label} · {win ? "胜利" : "失败"}
      </p>
      <div className="mt-2 space-y-1.5">
        {sorted.map((p) => (
          <div
            key={p.playerName}
            className={`flex items-center gap-3 rounded-sm px-2 py-1.5 text-xs ${
              p.member ? "bg-[var(--gold)]/[0.06]" : ""
            }`}
          >
            <span className="w-8 shrink-0 text-[10px] font-medium text-[var(--muted)]">
              {POSITION_LABEL[p.position] ?? "-"}
            </span>
            <span
              className={`w-20 shrink-0 truncate font-medium ${
                p.member ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {p.member || p.playerName.split("#")[0]}
            </span>
            <span className="w-16 shrink-0 truncate text-[var(--muted)]">{p.champion}</span>
            <ItemStrip items={p.items} version={version} />
            <span className="ml-auto shrink-0 tabular-nums text-[var(--foreground)]">
              {p.kills}/{p.deaths}/{p.assists}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums font-semibold text-[var(--gold)]">
              {p.score !== null ? p.score.toFixed(1) : "-"}
            </span>
            {p.award ? (
              <Pill tone={p.award === "MVP" ? "good" : "warning"}>{p.award}</Pill>
            ) : (
              <span className="w-10 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match, version }: { match: StoredMatch; version: string }) {
  const teamA = match.players.filter((p) => p.teamId === 100);
  const teamB = match.players.filter((p) => p.teamId === 200);
  const win = teamA[0]?.win ?? true;
  return (
    <Link
      href={`/matches/${match.gameId}`}
      className="group block rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5 transition hover:border-[var(--gold)]/60"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="neutral">{formatTime(match.gameCreationMs)}</Pill>
          <Pill tone="neutral">{match.queueName}</Pill>
          <Pill tone="neutral">{match.durationMin} 分钟</Pill>
          <Pill tone="neutral">车队 {match.rosterCount} 人同队</Pill>
        </div>
        <span className="text-xs font-semibold text-[var(--gold)] opacity-0 transition group-hover:opacity-100">
          查看详情 →
        </span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <TeamBlock label="蓝色方" win={win} players={teamA} version={version} />
        <TeamBlock label="红色方" win={!win} players={teamB} version={version} />
      </div>
    </Link>
  );
}

export default async function MatchesPage() {
  const dbReady = isDbConfigured();
  const [matches, version] = await Promise.all([
    dbReady ? listMatches(100) : Promise.resolve([] as StoredMatch[]),
    getDdragonVersion(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
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
        <div className="space-y-4">
          {matches.map((m) => (
            <MatchCard key={m.gameId} match={m} version={version} />
          ))}
        </div>
      )}
    </div>
  );
}
