import Link from "next/link";
import { notFound } from "next/navigation";
import champNameData from "@/data/champions.json";
import { getMatch, type StoredPlayer, type TeamStats } from "@/lib/db";
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

const champNameMap = champNameData as Record<string, string>;

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
  | "gold"
  | "damageToChampions"
  | "damageTaken"
  | "heal"
  | "cs"
  | "visionScore"
  | "turretDamage"
  | "ccTime"
  | "damageSelfMitigated",
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

// mm:ss-ish, but in Chinese ("3 分 42 秒") -- used for death-time, which
// commonly runs well past 60 seconds in a 20+ minute game, unlike ccTime.
function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m} 分 ${rem} 秒` : `${m} 分`;
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

// Generic "total number + colored proportional segments" bar, shared by the
// physical/magic/true damage split and the self-heal/teammate-heal split.
function SplitBar({
  total,
  segments,
  maxTotal,
}: {
  total: number;
  segments: { label: string; value: number; color: string }[];
  maxTotal: number;
}) {
  const segSum = Math.max(segments.reduce((s, x) => s + x.value, 0), 1);
  const widthPct = maxTotal > 0 ? Math.min(100, (total / maxTotal) * 100) : 0;
  return (
    <div className="px-2 pb-1.5 pt-1">
      <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">{total.toLocaleString("zh-CN")}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5" style={{ width: `${Math.max(widthPct, 8)}%` }}>
        <div className="flex h-full">
          {segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                style={{ width: `${(s.value / segSum) * 100}%`, backgroundColor: s.color }}
                title={`${s.label} ${s.value.toLocaleString("zh-CN")}`}
              />
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

function DamageBreakdown({ p, maxTotal }: { p: StoredPlayer; maxTotal: number }) {
  return (
    <SplitBar
      total={p.damageToChampions}
      maxTotal={maxTotal}
      segments={[
        { label: "物理", value: p.physicalDamage, color: "#e08a4b" },
        { label: "魔法", value: p.magicDamage, color: "#6f8fe0" },
        { label: "真实", value: p.trueDamage, color: "#c9ccd6" },
      ]}
    />
  );
}

// Riot's totalHeal already includes healing done to teammates -- split it
// back out so supports/healers show up distinctly from self-sustain. Older
// rows synced before db/schema_player_extra.sql come back with
// healsOnTeammates = 0, so they just render as "100% 自愈" until re-synced
// with "刷新旧对局" checked, rather than showing a broken negative split.
function HealBreakdown({ p, maxTotal }: { p: StoredPlayer; maxTotal: number }) {
  const teammates = Math.min(p.healsOnTeammates, p.heal);
  const self = Math.max(p.heal - teammates, 0);
  return (
    <SplitBar
      total={p.heal}
      maxTotal={maxTotal}
      segments={[
        { label: "自愈", value: self, color: "#e7b655" },
        { label: "治疗队友", value: teammates, color: "#4fb286" },
      ]}
    />
  );
}

// ---- Per-player "本局定位" hexagon -----------------------------------
// Every axis is normalized against the GAME-WIDE average (all 10 players
// in this match, not just one team) for that stat, and both the player's
// own line and their team's average are plotted against that same 100%
// baseline. Normalizing against a player's own team average instead would
// make the "team" polygon a perfect regular hexagon on every single axis
// for every single match by mathematical construction (a team's average
// share of itself is always exactly 100%), which looks identical game to
// game and carries no real information -- using the whole lobby as the
// baseline means both polygons are genuine, varying data.
type HexAxis = { label: string; playerRatio: number; teamRatio: number };

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function ratioToAvg(value: number, base: number): number {
  return base > 0 ? (value / base) * 100 : 100;
}

function kdaValue(p: StoredPlayer): number {
  return p.kda ?? (p.kills + p.assists) / Math.max(p.deaths, 1);
}

// Kill participation is inherently relative to one's OWN team's total
// kills, so this always looks the player's teammates up in allPlayers
// rather than assuming the caller's `team` slice.
function participationOf(p: StoredPlayer, allPlayers: StoredPlayer[]): number {
  const teamKills = allPlayers
    .filter((x) => x.teamId === p.teamId)
    .reduce((s, x) => s + x.kills, 0);
  return teamKills > 0 ? ((p.kills + p.assists) / teamKills) * 100 : 0;
}

function buildHexAxes(p: StoredPlayer, team: StoredPlayer[], allPlayers: StoredPlayer[]): HexAxis[] {
  const teamAvgOf = (get: (x: StoredPlayer) => number) => avg(team.map(get));
  const gameAvgParticipation = avg(allPlayers.map((x) => participationOf(x, allPlayers)));
  const gameAvgGold = avg(allPlayers.map((x) => x.gold));
  const gameAvgHeal = avg(allPlayers.map((x) => x.heal));
  const gameAvgDamage = avg(allPlayers.map((x) => x.damageToChampions));
  const gameAvgTaken = avg(allPlayers.map((x) => x.damageTaken));
  const gameAvgKda = avg(allPlayers.map(kdaValue));

  const axis = (label: string, playerValue: number, teamValue: number, base: number): HexAxis => ({
    label,
    playerRatio: ratioToAvg(playerValue, base),
    teamRatio: ratioToAvg(teamValue, base),
  });

  return [
    axis("参团率", participationOf(p, allPlayers), teamAvgOf((x) => participationOf(x, allPlayers)), gameAvgParticipation),
    axis("经济", p.gold, teamAvgOf((x) => x.gold), gameAvgGold),
    axis("伤害", p.damageToChampions, teamAvgOf((x) => x.damageToChampions), gameAvgDamage),
    axis("承伤", p.damageTaken, teamAvgOf((x) => x.damageTaken), gameAvgTaken),
    axis("治疗", p.heal, teamAvgOf((x) => x.heal), gameAvgHeal),
    axis("KDA", kdaValue(p), teamAvgOf(kdaValue), gameAvgKda),
  ];
}

function hexPoint(index: number, count: number, radius: number, cx: number, cy: number): [number, number] {
  const angle = (Math.PI / 180) * (index * (360 / count) - 90);
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function RadarChart({ axes, size = 124 }: { axes: HexAxis[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 20;
  const toPath = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  // Ratios are game-average-relative (100 = game average); clamp the drawn
  // radius at 200% of average so one outlier stat can't blow up the shape.
  const scale = (ratio: number) => (Math.max(0, Math.min(200, ratio)) / 200) * R;
  const baselinePoints = axes.map((_, i) => hexPoint(i, axes.length, R / 2, cx, cy));
  const teamPoints = axes.map((a, i) => hexPoint(i, axes.length, scale(a.teamRatio), cx, cy));
  const playerPoints = axes.map((a, i) => hexPoint(i, axes.length, scale(a.playerRatio), cx, cy));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={toPath(axes.map((_, i) => hexPoint(i, axes.length, R * f, cx, cy)))}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
        />
      ))}
      {/* dashed reference ring = 100% = this game's 10-player average */}
      <polygon points={toPath(baselinePoints)} fill="none" stroke="rgba(255,255,255,0.28)" strokeDasharray="2,2" />
      <polygon points={toPath(teamPoints)} fill="var(--series-1)" fillOpacity="0.16" stroke="var(--series-1)" strokeWidth="1.25" />
      <polygon points={toPath(playerPoints)} fill="var(--gold)" fillOpacity="0.22" stroke="var(--gold)" strokeWidth="1.5" />
      {axes.map((a, i) => {
        const [lx, ly] = hexPoint(i, axes.length, R + 12, cx, cy);
        return (
          <text key={a.label} x={lx} y={ly} fontSize="7.5" textAnchor="middle" dominantBaseline="middle" fill="var(--muted)">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

function HexLegend({ axes }: { axes: HexAxis[] }) {
  return (
    <div className="flex-1">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--gold)" }} />
          本人
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--series-1)" }} />
          本队平均
        </span>
        <span>基准：本局 10 人平均 = 100%</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {axes.map((a) => (
          <div key={a.label} className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted)]">{a.label}</span>
            <span className="tabular-nums">
              <span className={`font-medium ${a.playerRatio >= 100 ? "text-[var(--status-good)]" : "text-[var(--foreground)]"}`}>
                {Math.round(a.playerRatio)}%
              </span>
              <span className="text-[var(--muted)]"> / {Math.round(a.teamRatio)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerDetailCard({
  p,
  team,
  allPlayers,
  version,
  championMap,
  spellMap,
  maxima,
}: {
  p: StoredPlayer;
  team: StoredPlayer[];
  allPlayers: StoredPlayer[];
  version: string;
  championMap: Record<number, string>;
  spellMap: Record<number, string>;
  maxima: Maxima;
}) {
  const itemIds = parseItemIds(p.items);
  const champIcon = championIconUrl(version, championMap, p.championId);
  const spell1 = summonerSpellIconUrl(version, spellMap, p.spell1Id);
  const spell2 = summonerSpellIconUrl(version, spellMap, p.spell2Id);
  const hexAxes = buildHexAxes(p, team, allPlayers);

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
        <StatCell label="伤害减免">
          <StatBar value={p.damageSelfMitigated} max={maxima.damageSelfMitigated} />
        </StatCell>
        <StatCell label="治疗量">
          <HealBreakdown p={p} maxTotal={maxima.heal} />
        </StatCell>
        <StatCell label="防御塔伤害">
          <StatBar value={p.turretDamage} max={maxima.turretDamage} />
        </StatCell>
        <StatCell label="控制时长">
          <StatBar value={p.ccTime} max={maxima.ccTime} suffix=" 秒" />
        </StatCell>
        <StatCell label="经济">
          <StatBar value={p.gold} max={maxima.gold} />
          <p className="px-2 pb-1.5 text-[10px] text-[var(--muted)]">已花 {p.goldSpent.toLocaleString("zh-CN")}</p>
        </StatCell>
        <StatCell label="连杀">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.killingSprees} 次</p>
            <p className="text-[10px] text-[var(--muted)]">最大 {p.largestKillingSpree} 连杀</p>
          </div>
        </StatCell>
        <StatCell label="资源偷取">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.objectivesStolen}</p>
          </div>
        </StatCell>
        <StatCell label="死亡时长">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{formatSeconds(p.timeSpentDead)}</p>
          </div>
        </StatCell>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-[var(--border)]/40 pt-3">
        <RadarChart axes={hexAxes} />
        <HexLegend axes={hexAxes} />
      </div>
    </div>
  );
}

function TeamSection({
  label,
  win,
  players,
  allPlayers,
  version,
  championMap,
  spellMap,
  maxima,
}: {
  label: string;
  win: boolean;
  players: StoredPlayer[];
  allPlayers: StoredPlayer[];
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
            team={players}
            allPlayers={allPlayers}
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

// ---- Match-wide recap: bans, objectives, team totals ------------------
type ObjectiveKey = "dragon" | "baron" | "tower" | "inhibitor" | "riftHerald" | "atakhan" | "horde";
const OBJECTIVE_ROWS: { key: ObjectiveKey; label: string }[] = [
  { key: "tower", label: "防御塔" },
  { key: "inhibitor", label: "水晶" },
  { key: "dragon", label: "小龙" },
  { key: "baron", label: "大龙" },
  { key: "riftHerald", label: "峡谷先锋" },
  { key: "atakhan", label: "阿塔坎" },
  { key: "horde", label: "虚空幼虫" },
];
// Standard Summoner's Rift objectives always show, even at 0-0 -- that's
// still meaningful ("neither team touched dragons"). Atakhan/horde are
// newer additions that don't exist on every map/patch, so they only show
// up when someone actually recorded a kill on them.
const ALWAYS_SHOW_OBJECTIVE = new Set<ObjectiveKey>(["tower", "inhibitor", "dragon", "baron", "riftHerald"]);

// Which TeamStats boolean field says who got to each objective first.
// Matches synced before db/schema's "firsts" fields existed simply won't
// have these keys in their stored JSON, so every lookup is guarded with
// `typeof ... === "boolean"` at the call site rather than assumed present.
const FIRST_KEY: Partial<Record<ObjectiveKey, "firstTower" | "firstDragon" | "firstBaron" | "firstInhibitor" | "firstRiftHerald" | "firstAtakhan" | "firstHorde">> = {
  tower: "firstTower",
  dragon: "firstDragon",
  baron: "firstBaron",
  inhibitor: "firstInhibitor",
  riftHerald: "firstRiftHerald",
  atakhan: "firstAtakhan",
  horde: "firstHorde",
};

function sumBy(players: StoredPlayer[], get: (p: StoredPlayer) => number): number {
  return players.reduce((s, p) => s + get(p), 0);
}

// "红色方领先 7,124（+11%）" -- both the absolute gap and the percentage
// are derived straight from the totals already being compared, never a
// separate/guessed figure.
function formatDelta(blue: number, red: number, fmt: (n: number) => string): string | null {
  if (blue === red) return null;
  const leaderIsBlue = blue > red;
  const diff = Math.abs(blue - red);
  const base = Math.max(Math.min(blue, red), 1);
  const pct = Math.round((diff / base) * 100);
  return `${leaderIsBlue ? "蓝色方" : "红色方"}领先 ${fmt(diff)}（+${pct}%）`;
}

function CompareRow({
  label,
  blue,
  red,
  formatValue,
  first,
}: {
  label: string;
  blue: number;
  red: number;
  formatValue?: (n: number) => string;
  first?: "blue" | "red" | null;
}) {
  const total = Math.max(blue + red, 1);
  const fmt = formatValue ?? ((n: number) => String(n));
  const bluePct = (blue / total) * 100;
  const redPct = (red / total) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-right font-medium tabular-nums text-[var(--status-good)] sm:w-16">
        {first === "blue" ? (
          <span className="text-[var(--gold)]" title="率先拿到">
            ★
          </span>
        ) : null}
        {fmt(blue)}
      </span>
      <div className="flex h-1.5 flex-1 gap-[2px]">
        <div
          className="h-full rounded-full bg-[var(--status-good)]/70"
          style={{ width: bluePct > 0 ? `${bluePct}%` : 0 }}
        />
        <div
          className="h-full rounded-full bg-[var(--status-critical)]/70"
          style={{ width: redPct > 0 ? `${redPct}%` : 0 }}
        />
      </div>
      <span className="flex w-10 shrink-0 items-center gap-0.5 font-medium tabular-nums text-[var(--status-critical)] sm:w-16">
        {fmt(red)}
        {first === "red" ? (
          <span className="text-[var(--gold)]" title="率先拿到">
            ★
          </span>
        ) : null}
      </span>
      <span className="w-14 shrink-0 text-center text-[var(--muted)] sm:w-16">{label}</span>
    </div>
  );
}

function BansStrip({
  label,
  bans,
  championMap,
  version,
}: {
  label: string;
  bans: number[];
  championMap: Record<number, string>;
  version: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="flex flex-wrap gap-1">
        {bans.length ? (
          bans.map((id, i) => {
            const url = championIconUrl(version, championMap, id);
            const name = champNameMap[String(id)] ?? "";
            return url ? (
              <img
                key={i}
                src={url}
                alt={name}
                title={name}
                width={26}
                height={26}
                className="rounded-[4px] border border-[var(--border)] opacity-75 grayscale"
              />
            ) : (
              <span key={i} className="h-[26px] w-[26px] rounded-[4px] border border-dashed border-[var(--border)]" />
            );
          })
        ) : (
          <span className="text-xs text-[var(--muted)]">无禁用</span>
        )}
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

function TeamOverview({
  players,
  teamStats,
  championMap,
  version,
}: {
  players: StoredPlayer[];
  teamStats: Record<string, TeamStats> | null;
  championMap: Record<number, string>;
  version: string;
}) {
  const teamA = players.filter((p) => p.teamId === 100);
  const teamB = players.filter((p) => p.teamId === 200);
  const blue = teamStats?.["100"] ?? null;
  const red = teamStats?.["200"] ?? null;

  const totals: { label: string; blue: number; red: number; formatValue?: (n: number) => string }[] = [
    { label: "总击杀", blue: sumBy(teamA, (p) => p.kills), red: sumBy(teamB, (p) => p.kills) },
    {
      label: "总经济",
      blue: sumBy(teamA, (p) => p.gold),
      red: sumBy(teamB, (p) => p.gold),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总伤害",
      blue: sumBy(teamA, (p) => p.damageToChampions),
      red: sumBy(teamB, (p) => p.damageToChampions),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总承伤",
      blue: sumBy(teamA, (p) => p.damageTaken),
      red: sumBy(teamB, (p) => p.damageTaken),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总治疗",
      blue: sumBy(teamA, (p) => p.heal),
      red: sumBy(teamB, (p) => p.heal),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    { label: "总视野", blue: sumBy(teamA, (p) => p.visionScore), red: sumBy(teamB, (p) => p.visionScore) },
    {
      label: "总减伤",
      blue: sumBy(teamA, (p) => p.damageSelfMitigated),
      red: sumBy(teamB, (p) => p.damageSelfMitigated),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
  ];

  const objectiveRows =
    blue && red
      ? OBJECTIVE_ROWS.filter((row) => ALWAYS_SHOW_OBJECTIVE.has(row.key) || blue[row.key] > 0 || red[row.key] > 0)
      : [];

  // Compact one-line summary, shown even when the details are collapsed.
  const insights: string[] = [];
  if (blue && red) {
    if (typeof blue.firstBlood === "boolean") {
      insights.push(`一血：${blue.firstBlood ? "蓝色方" : "红色方"}`);
    }
  }
  const goldTotal = totals.find((t) => t.label === "总经济")!;
  const goldMsg = formatDelta(goldTotal.blue, goldTotal.red, goldTotal.formatValue!);
  if (goldMsg) insights.push(`经济 ${goldMsg}`);
  const dmgTotal = totals.find((t) => t.label === "总伤害")!;
  const dmgMsg = formatDelta(dmgTotal.blue, dmgTotal.red, dmgTotal.formatValue!);
  if (dmgMsg) insights.push(`伤害 ${dmgMsg}`);

  return (
    <details open className="group mb-6 rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-wider text-[var(--gold)]">对局概览</p>
          {insights.length ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{insights.join(" · ")}</p>
          ) : null}
        </div>
        <span className="mt-0.5 text-[var(--muted)]">
          <ChevronIcon />
        </span>
      </summary>

      <div className="mt-4 border-t border-[var(--border)]/40 pt-4">
        {blue && red ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <BansStrip label="蓝色方禁用" bans={blue.bans} championMap={championMap} version={version} />
              <BansStrip label="红色方禁用" bans={red.bans} championMap={championMap} version={version} />
            </div>
            <div className="space-y-1.5">
              {objectiveRows.map((row) => {
                const firstKey = FIRST_KEY[row.key];
                const firstSide: "blue" | "red" | null =
                  firstKey && typeof blue[firstKey] === "boolean"
                    ? blue[firstKey]
                      ? "blue"
                      : red[firstKey]
                        ? "red"
                        : null
                    : null;
                return (
                  <CompareRow
                    key={row.key}
                    label={row.label}
                    blue={Number(blue[row.key])}
                    red={Number(red[row.key])}
                    first={firstSide}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <p className="mb-4 text-xs text-[var(--muted)]">
            这场对局的目标 / 禁用数据还没同步（旧数据），重新点一次同步会自动补上。
          </p>
        )}

        <div className="mt-4 space-y-1.5 border-t border-[var(--border)]/40 pt-4">
          {totals.map((row) => (
            <CompareRow key={row.label} label={row.label} blue={row.blue} red={row.red} formatValue={row.formatValue} />
          ))}
        </div>
      </div>
    </details>
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
    damageSelfMitigated: max((p) => p.damageSelfMitigated),
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
        <Pill tone="neutral">对局 ID：{match.gameId}</Pill>
      </div>

      <TeamOverview players={match.players} teamStats={match.teamStats} championMap={championMap} version={version} />

      <div className="space-y-6">
        <TeamSection
          label="蓝色方"
          win={win}
          players={teamA}
          allPlayers={match.players}
          version={version}
          championMap={championMap}
          spellMap={spellMap}
          maxima={maxima}
        />
        <TeamSection
          label="红色方"
          win={!win}
          players={teamB}
          allPlayers={match.players}
          version={version}
          championMap={championMap}
          spellMap={spellMap}
          maxima={maxima}
        />
      </div>
    </div>
  );
}
