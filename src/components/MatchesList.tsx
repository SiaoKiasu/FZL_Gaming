"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StoredMatch, StoredPlayer } from "@/lib/db";
import { itemIconUrl, parseItemIds } from "@/lib/ddragon";
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

export default function MatchesList({
  matches,
  version,
}: {
  matches: StoredMatch[];
  version: string;
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
            <MatchCard key={m.gameId} match={m} version={version} />
          ))}
        </div>
      )}
    </div>
  );
}
