import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatch, type StoredPlayer } from "@/lib/db";
import {
  championIconUrl,
  getChampionIconMap,
  getDdragonVersion,
  getSummonerSpellMap,
  itemIconUrl,
  parseItemIds,
  summonerSpellIconUrl,
} from "@/lib/ddragon";
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

type Maxima = Record<
  "gold" | "damageToChampions" | "damageTaken" | "heal" | "cs" | "visionScore" | "turretDamage" | "ccTime",
  number
>;

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

function StatBar({ value, max, digits = 0, suffix = "" }: { value: number; max: number; digits?: number; suffix?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="relative w-full">
      <div
        className="absolute inset-y-0 left-0 rounded-sm bg-[var(--gold)]/15"
        style={{ width: `${pct}%` }}
      />
      <span className="relative z-10 block px-2 py-1 text-sm tabular-nums text-[var(--foreground)]">
        {value.toLocaleString("zh-CN", { maximumFractionDigits: digits })}
        {suffix}
      </span>
    </div>
  );
}

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-[var(--border)]/60 bg-white/[0.02]">
      <p className="border-b border-[var(--border)]/40 px-2 pt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function DamageBreakdown({ p, maxTotal }: { p: StoredPlayer; maxTotal: number }) {
  const total = Math.max(p.physicalDamage + p.magicDamage + p.trueDamage, 1);
  const segs = [
    { label: "物理", value: p.physicalDamage, color: "#e08a4b" },
    { label: "魔法", value: p.magicDamage, color: "#6f8fe0" },
    { label: "真实", value: p.trueDamage, color: "#c9ccd6" },
  ];
  const widthPct = maxTotal > 0 ? Math.min(100, (total / maxTotal) * 100) : 0;
  return (
    <div className="px-2 pb-1.5 pt-1">
      <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
        {p.damageToChampions.toLocaleString("zh-CN")}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5" style={{ width: `${Math.max(widthPct, 8)}%` }}>
        <div className="flex h-full">
          {segs.map((s) =>
            s.value > 0 ? (
              <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} title={`${s.label} ${s.value}`} />
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerDetailCard({
  p,
  version,
  championMap,
  spellMap,
  maxima,
}: {
  p: StoredPlayer;
  version: string;
  championMap: Record<number, string>;
  spellMap: Record<number, string>;
  maxima: Maxima;
}) {
  const itemIds = parseItemIds(p.items);
  const champIcon = championIconUrl(version, championMap, p.championId);
  const spell1 = summonerSpellIconUrl(version, spellMap, p.spell1Id);
  const spell2 = summonerSpellIconUrl(version, spellMap, p.spell2Id);

  return (
    <div
      className={`rounded-sm border border-[var(--border)]/60 p-4 ${p.member ? "bg-[var(--gold)]/[0.04]" : "bg-white/[0.015]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative">
              {champIcon ? (
                <img src={champIcon} alt="" width={52} height={52} className="rounded-full border-2 border-[var(--border)]" />
              ) : (
                <div className="h-[52px] w-[52px] rounded-full border-2 border-dashed border-[var(--border)]" />
              )}
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#0a0f1e] px-1 text-[10px] font-bold text-[var(--gold)]">
                {p.champLevel}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {[spell1, spell2].map((url, i) =>
                url ? (
                  <img key={i} src={url} alt="" width={22} height={22} className="rounded-[4px] border border-[var(--border)]" />
                ) : (
                  <span key={i} className="h-[22px] w-[22px] rounded-[4px] border border-dashed border-[var(--border)]" />
                )
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Pill tone="neutral">{POSITION_LABEL[p.position] ?? "-"}</Pill>
              {p.award ? <Pill tone={p.award === "MVP" ? "good" : "warning"}>{p.award}</Pill> : null}
              {p.firstBlood ? <Pill tone="critical">一血</Pill> : null}
              {p.multiKill ? <Pill tone="warning">{p.multiKill}</Pill> : null}
            </div>
            <p className={`font-display font-bold ${p.member ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
              {p.member || p.playerName.split("#")[0]}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {p.champion} · {p.playerName}
            </p>
          </div>
        </div>

        <div className="ml-auto text-right">
          <p className="tabular-nums">
            <span className="text-lg font-semibold text-[var(--foreground)]">
              {p.kills}/{p.deaths}/{p.assists}
            </span>
          </p>
          <p className="text-xs text-[var(--muted)]">{p.kda !== null ? `${p.kda.toFixed(2)} KDA` : ""}</p>
          <p className="mt-1 font-display text-lg font-bold text-[var(--gold)]">
            {p.score !== null ? p.score.toFixed(1) : "-"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-1">
        {itemIds.map((id, i) => {
          const url = itemIconUrl(version, id);
          return url ? (
            <img key={i} src={url} alt="" width={28} height={28} className="rounded-[4px] border border-[var(--border)]" />
          ) : (
            <span key={i} className="h-[28px] w-[28px] rounded-[4px] border border-dashed border-[var(--border)]" />
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell label="补刀">
          <StatBar value={p.cs} max={maxima.cs} />
        </StatCell>
        <StatCell label="视野得分">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.visionScore}</p>
            <p className="text-[10px] text-[var(--muted)]">插眼 {p.wardsPlaced} · 排眼 {p.wardsKilled}</p>
          </div>
        </StatCell>
        <StatCell label="对英雄输出">
          <DamageBreakdown p={p} maxTotal={maxima.damageToChampions} />
        </StatCell>
        <StatCell label="承受伤害">
          <StatBar value={p.damageTaken} max={maxima.damageTaken} />
        </StatCell>
        <StatCell label="治疗量">
          <StatBar value={p.heal} max={maxima.heal} />
        </StatCell>
        <StatCell label="防御塔伤害">
          <StatBar value={p.turretDamage} max={maxima.turretDamage} />
        </StatCell>
        <StatCell label="控制时长">
          <StatBar value={p.ccTime} max={maxima.ccTime} suffix=" 秒" />
        </StatCell>
        <StatCell label="经济">
          <StatBar value={p.gold} max={maxima.gold} />
        </StatCell>
      </div>
    </div>
  );
}

function TeamSection({
  label,
  win,
  players,
  version,
  championMap,
  spellMap,
  maxima,
}: {
  label: string;
  win: boolean;
  players: StoredPlayer[];
  version: string;
  championMap: Record<number, string>;
  spellMap: Record<number, string>;
  maxima: Maxima;
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
        className={`font-display mb-3 text-sm font-bold uppercase tracking-wider ${
          win ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"
        }`}
      >
        {label} · {win ? "胜利" : "失败"}
      </p>
      <div className="space-y-3">
        {sorted.map((p) => (
          <PlayerDetailCard
            key={p.playerName}
            p={p}
            version={version}
            championMap={championMap}
            spellMap={spellMap}
            maxima={maxima}
          />
        ))}
      </div>
    </div>
  );
}

function computeMaxima(players: StoredPlayer[]): Maxima {
  const max = (get: (p: StoredPlayer) => number) =>
    Math.max(1, ...players.map((p) => get(p)));
  return {
    gold: max((p) => p.gold),
    damageToChampions: max((p) => p.damageToChampions),
    damageTaken: max((p) => p.damageTaken),
    heal: max((p) => p.heal),
    cs: max((p) => p.cs),
    visionScore: max((p) => p.visionScore),
    turretDamage: max((p) => p.turretDamage),
    ccTime: max((p) => p.ccTime),
  };
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const [match, version, championMap, spellMap] = await Promise.all([
    getMatch(gameId),
    getDdragonVersion(),
    getChampionIconMap(),
    getSummonerSpellMap(),
  ]);

  if (!match) notFound();

  const teamA = match.players.filter((p) => p.teamId === 100);
  const teamB = match.players.filter((p) => p.teamId === 200);
  const win = teamA[0]?.win ?? true;
  const maxima = computeMaxima(match.players);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
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
        <TeamSection label="蓝色方" win={win} players={teamA} version={version} championMap={championMap} spellMap={spellMap} maxima={maxima} />
        <TeamSection label="红色方" win={!win} players={teamB} version={version} championMap={championMap} spellMap={spellMap} maxima={maxima} />
      </div>
    </div>
  );
}
