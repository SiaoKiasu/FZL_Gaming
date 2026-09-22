import Link from "next/link";
import type { StoredMatch, StoredPlayer } from "@/lib/db";
import { championIconUrl } from "@/lib/ddragon";
import Pill from "@/components/Pill";

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

// Builds the /matches?queue=...&page=... href for a filter pill or a
// pagination link. "全部" and page 1 are the defaults, so they're left off
// the query string entirely rather than written out as queue=全部&page=1.
function matchesHref(queue: string, page: number) {
  const params = new URLSearchParams();
  if (queue !== "全部") params.set("queue", queue);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/matches?${qs}` : "/matches";
}

// Collapsed list view -- just enough to scan a match at a glance. Items,
// score, damage breakdown etc. all live on the detail page (/matches/[id])
// now, one click away.
function TeamBlock({
  label,
  win,
  players,
  version,
  championMap,
}: {
  label: string;
  win: boolean;
  players: StoredPlayer[];
  version: string;
  championMap: Record<number, string>;
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
        {sorted.map((p) => {
          const iconUrl = championIconUrl(version, championMap, p.championId);
          return (
            <div
              key={p.playerName}
              className={`flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-xs sm:gap-3 sm:px-2 ${
                p.member ? "bg-[var(--gold)]/[0.06]" : ""
              }`}
            >
              <span className="hidden w-8 shrink-0 text-[10px] font-medium text-[var(--muted)] sm:block">
                {POSITION_LABEL[p.position] ?? "-"}
              </span>
              {iconUrl ? (
                <img src={iconUrl} alt="" width={20} height={20} className="shrink-0 rounded-full border border-[var(--border)]" />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-[var(--border)]" />
              )}
              <span
                className={`w-14 shrink-0 truncate font-medium sm:w-20 ${
                  p.member ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {p.member || p.playerName.split("#")[0]}
              </span>
              <span className="hidden w-16 shrink-0 truncate text-[var(--muted)] sm:block">{p.champion}</span>
              {p.award ? (
                <span
                  title={p.award === "MVP" ? "MVP · 获胜方最佳" : "SVP · 落败方最佳"}
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    p.award === "MVP"
                      ? "bg-[var(--status-good)]/10 text-[var(--status-good)]"
                      : "bg-[var(--status-warning)]/10 text-[var(--status-warning)]"
                  }`}
                >
                  {p.award}
                </span>
              ) : null}
              <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
                <span className="text-[var(--foreground)]">
                  {p.kills}/{p.deaths}/{p.assists}
                </span>
                <span className="w-9 text-right font-display font-bold text-[var(--gold)]">
                  {p.score !== null ? p.score.toFixed(1) : "-"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  version,
  championMap,
}: {
  match: StoredMatch;
  version: string;
  championMap: Record<number, string>;
}) {
  const teamA = match.players.filter((p) => p.teamId === 100);
  const teamB = match.players.filter((p) => p.teamId === 200);
  const win = teamA[0]?.win ?? true;
  return (
    <Link
      href={`/matches/${match.gameId}`}
      className="group block rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4 transition hover:border-[var(--gold)]/60 sm:p-5"
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
        <TeamBlock label="蓝色方" win={win} players={teamA} version={version} championMap={championMap} />
        <TeamBlock label="红色方" win={!win} players={teamB} version={version} championMap={championMap} />
      </div>
    </Link>
  );
}

export default function MatchesList({
  matches,
  version,
  championMap,
  currentQueue,
  availableQueues,
  page,
  totalPages,
}: {
  matches: StoredMatch[];
  version: string;
  championMap: Record<number, string>;
  // "全部" or one of availableQueues -- which filter pill is active.
  currentQueue: string;
  // Queues that actually have synced matches, in display order.
  availableQueues: string[];
  page: number;
  totalPages: number;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {["全部", ...availableQueues].map((q) => (
          <Link
            key={q}
            href={matchesHref(q, 1)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              currentQueue === q
                ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--foreground)]"
            }`}
          >
            {q}
          </Link>
        ))}
      </div>

      {matches.length === 0 ? (
        <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
          这个模式还没有战绩记录。
        </p>
      ) : (
        <div className="space-y-4">
          {matches.map((m) => (
            <MatchCard key={m.gameId} match={m} version={version} championMap={championMap} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-4">
          {page > 1 ? (
            <Link
              href={matchesHref(currentQueue, page - 1)}
              className="rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
            >
              ‹ 上一页
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-semibold text-[var(--muted)]/40">
              ‹ 上一页
            </span>
          )}

          <span className="text-xs text-[var(--muted)]">
            第 {page} / {totalPages} 页
          </span>

          {page < totalPages ? (
            <Link
              href={matchesHref(currentQueue, page + 1)}
              className="rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
            >
              下一页 ›
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-semibold text-[var(--muted)]/40">
              下一页 ›
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
