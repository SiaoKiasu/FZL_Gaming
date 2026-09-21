"use client";

import { useMemo, useState } from "react";
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

// Display order for the filter pills — only modes that actually have
// synced games show up, in this fixed order.
const QUEUE_ORDER = ["单双排", "灵活组排", "大乱斗", "海克斯大乱斗", "匹配"];

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
}: {
  matches: StoredMatch[];
  version: string;
  championMap: Record<number, string>;
}) {
  const [filter, setFilter] = useState<string>("全部");

  const available = useMemo(() => {
    const present = new Set(matches.map((m) => m.queueName));
    return QUEUE_ORDER.filter((q) => present.has(q));
  }, [matches]);

  const filtered = filter === "全部" ? matches : matches.filter((m) => m.queueName === filter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {["全部", ...available].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setFilter(q)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              filter === q
                ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--foreground)]"
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
          这个模式还没有战绩记录。
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <MatchCard key={m.gameId} match={m} version={version} championMap={championMap} />
          ))}
        </div>
      )}
    </div>
  );
}
