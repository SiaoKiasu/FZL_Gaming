import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatch, type StoredPlayer } from "@/lib/db";
import { getDdragonVersion, itemIconUrl, parseItemIds } from "@/lib/ddragon";
import Pill from "@/components/Pill";

export const dynamic = "force-dynamic";

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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatBar({ value, max, digits = 0 }: { value: number; max: number; digits?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="relative w-[72px]">
      <div
        className="absolute inset-y-0 left-0 rounded-sm bg-[var(--gold)]/15"
        style={{ width: `${pct}%` }}
      />
      <span className="relative z-10 block px-1.5 py-0.5 text-right text-xs tabular-nums text-[var(--foreground)]">
        {value.toLocaleString("zh-CN", { maximumFractionDigits: digits })}
      </span>
    </div>
  );
}

function PlayerRow({
  p,
  version,
  maxima,
}: {
  p: StoredPlayer;
  version: string;
  maxima: Record<"gold" | "damageToChampions" | "damageTaken" | "heal" | "cs" | "visionScore", number>;
}) {
  const itemIds = parseItemIds(p.items);
  return (
    <tr
      className={`border-b border-[var(--border)]/40 last:border-0 ${
        p.member ? "bg-[var(--gold)]/[0.05]" : ""
      }`}
    >
      <td className="whitespace-nowrap py-2.5 pl-3 pr-2 text-[11px] font-medium text-[var(--muted)]">
        {POSITION_LABEL[p.position] ?? "-"}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3">
        <div className={`font-medium ${p.member ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
          {p.member || p.playerName.split("#")[0]}
        </div>
        <div className="text-[11px] text-[var(--muted)]">{p.playerName}</div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3">
        <div className="font-medium text-[var(--foreground)]">{p.champion}</div>
        <div className="text-[11px] text-[var(--muted)]">Lv.{p.champLevel}</div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3">
        <div className="flex gap-0.5">
          {itemIds.map((id, i) => {
            const url = itemIconUrl(version, id);
            return url ? (
              <img
                key={i}
                src={url}
                alt=""
                width={22}
                height={22}
                className="rounded-[3px] border border-[var(--border)]"
              />
            ) : (
              <span
                key={i}
                className="h-[22px] w-[22px] rounded-[3px] border border-dashed border-[var(--border)]"
              />
            );
          })}
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
        <span className="text-[var(--foreground)]">
          {p.kills}/{p.deaths}/{p.assists}
        </span>
        <span className="ml-1.5 text-[11px] text-[var(--muted)]">
          {p.kda !== null ? `${p.kda.toFixed(2)} KDA` : ""}
        </span>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.cs} max={maxima.cs} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.visionScore} max={maxima.visionScore} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.damageToChampions} max={maxima.damageToChampions} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.damageTaken} max={maxima.damageTaken} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.heal} max={maxima.heal} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <StatBar value={p.gold} max={maxima.gold} />
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 text-right">
        <span className="font-semibold tabular-nums text-[var(--gold)]">
          {p.score !== null ? p.score.toFixed(1) : "-"}
        </span>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3">
        {p.award ? <Pill tone={p.award === "MVP" ? "good" : "warning"}>{p.award}</Pill> : null}
      </td>
    </tr>
  );
}

function TeamTable({
  label,
  win,
  players,
  version,
  maxima,
}: {
  label: string;
  win: boolean;
  players: StoredPlayer[];
  version: string;
  maxima: Record<"gold" | "damageToChampions" | "damageTaken" | "heal" | "cs" | "visionScore", number>;
}) {
  const sorted = [...players].sort(
    (a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9)
  );
  return (
    <div
      className={`rounded-sm border-l-2 bg-[var(--bg-panel)] p-4 ${
        win ? "border-[var(--status-good)]/60" : "border-[var(--status-critical)]/60"
      }`}
    >
      <p
        className={`font-display mb-2 text-sm font-bold uppercase tracking-wider ${
          win ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"
        }`}
      >
        {label} · {win ? "胜利" : "失败"}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="pb-2 pl-3 pr-2 font-medium">位置</th>
              <th className="pb-2 pr-3 font-medium">选手</th>
              <th className="pb-2 pr-3 font-medium">英雄</th>
              <th className="pb-2 pr-3 font-medium">装备</th>
              <th className="pb-2 pr-3 text-right font-medium">KDA</th>
              <th className="pb-2 pr-3 text-right font-medium">补刀</th>
              <th className="pb-2 pr-3 text-right font-medium">视野</th>
              <th className="pb-2 pr-3 text-right font-medium">输出</th>
              <th className="pb-2 pr-3 text-right font-medium">承伤</th>
              <th className="pb-2 pr-3 text-right font-medium">治疗</th>
              <th className="pb-2 pr-3 text-right font-medium">经济</th>
              <th className="pb-2 pr-3 text-right font-medium">评分</th>
              <th className="pb-2 pr-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <PlayerRow key={p.playerName} p={p} version={version} maxima={maxima} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function computeMaxima(players: StoredPlayer[]) {
  const max = (get: (p: StoredPlayer) => number) =>
    Math.max(1, ...players.map((p) => get(p)));
  return {
    gold: max((p) => p.gold),
    damageToChampions: max((p) => p.damageToChampions),
    damageTaken: max((p) => p.damageTaken),
    heal: max((p) => p.heal),
    cs: max((p) => p.cs),
    visionScore: max((p) => p.visionScore),
  };
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const [match, version] = await Promise.all([getMatch(gameId), getDdragonVersion()]);

  if (!match) notFound();

  const teamA = match.players.filter((p) => p.teamId === 100);
  const teamB = match.players.filter((p) => p.teamId === 200);
  const win = teamA[0]?.win ?? true;
  const maxima = computeMaxima(match.players);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <Link
        href="/matches"
        className="text-sm text-[var(--gold)] hover:text-[var(--gold-soft)]"
      >
        ← 返回战绩列表
      </Link>

      <div className="mb-8 mt-4 flex flex-wrap items-center gap-2">
        <Pill tone="neutral">{formatTime(match.gameCreationMs)}</Pill>
        <Pill tone="neutral">{match.queueName}</Pill>
        <Pill tone="neutral">{match.durationMin} 分钟</Pill>
        <Pill tone="neutral">车队 {match.rosterCount} 人同队</Pill>
      </div>

      <div className="space-y-6">
        <TeamTable label="蓝色方" win={win} players={teamA} version={version} maxima={maxima} />
        <TeamTable label="红色方" win={!win} players={teamB} version={version} maxima={maxima} />
      </div>
    </div>
  );
}
