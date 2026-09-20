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

function StatCell({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-[var(--border)]/60 bg-white/[0.02] transition-colors hover:border-[var(--border)]">
      <p className="flex items-center gap-1 border-b border-[var(--border)]/40 px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {icon ? <StatIcon name={icon} className="h-3 w-3 shrink-0 opacity-70" /> : null}
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
// playerRatio/teamRatio (both "% of this game's 10-player average") only
// drive the polygon's GEOMETRY -- they're never shown as text. Per explicit
// feedback: showing every stat as a made-up-looking percentage was
// confusing ("我不是说了只有参团率才是比例吗" -- 参团率/participation is
// inherently a rate, so it alone displays as a percentage; economy,
// damage, damage taken, heal and KDA display as their real numbers,
// exactly like the stat grid above). playerValue/teamValue carry those
// real numbers, formatted per-axis by `format`.
type HexAxis = {
  label: string;
  playerRatio: number;
  teamRatio: number;
  playerValue: number;
  teamValue: number;
  format: (n: number) => string;
};

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

  const axis = (
    label: string,
    playerValue: number,
    teamValue: number,
    base: number,
    format: (n: number) => string
  ): HexAxis => ({
    label,
    playerRatio: ratioToAvg(playerValue, base),
    teamRatio: ratioToAvg(teamValue, base),
    playerValue,
    teamValue,
    format,
  });
  const pct = (n: number) => `${Math.round(n)}%`;
  const int = (n: number) => Math.round(n).toLocaleString("zh-CN");
  const dec = (n: number) => n.toFixed(2);

  return [
    axis("参团率", participationOf(p, allPlayers), teamAvgOf((x) => participationOf(x, allPlayers)), gameAvgParticipation, pct),
    axis("经济", p.gold, teamAvgOf((x) => x.gold), gameAvgGold, int),
    axis("伤害", p.damageToChampions, teamAvgOf((x) => x.damageToChampions), gameAvgDamage, int),
    axis("承伤", p.damageTaken, teamAvgOf((x) => x.damageTaken), gameAvgTaken, int),
    axis("治疗", p.heal, teamAvgOf((x) => x.heal), gameAvgHeal, int),
    axis("KDA", kdaValue(p), teamAvgOf(kdaValue), gameAvgKda, dec),
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
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--gold)" }} />
          本人
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--series-1)" }} />
          本队平均
        </span>
        <span className="text-[var(--muted)]/70">· 形状按本局平均换算，数值为实际数据</span>
      </div>
      <div className="space-y-1">
        {axes.map((a) => {
          const above = a.playerRatio >= a.teamRatio;
          return (
            <div key={a.label} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--muted)]">{a.label}</span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <span className="font-semibold text-[var(--foreground)]">{a.format(a.playerValue)}</span>
                <svg
                  viewBox="0 0 10 10"
                  className={`h-2.5 w-2.5 shrink-0 ${above ? "text-[var(--status-good)]" : "text-[var(--status-critical)] rotate-180"}`}
                  fill="currentColor"
                >
                  <path d="M5 1L9 8H1L5 1Z" />
                </svg>
                <span className="text-[var(--muted)]">{a.format(a.teamValue)}</span>
              </span>
            </div>
          );
        })}
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
        <StatCell label="补刀" icon="cs">
          <StatBar value={p.cs} max={maxima.cs} />
        </StatCell>
        <StatCell label="视野得分" icon="vision">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.visionScore}</p>
            <p className="text-[10px] text-[var(--muted)]">插眼 {p.wardsPlaced} · 排眼 {p.wardsKilled}</p>
          </div>
        </StatCell>
        <StatCell label="对英雄输出" icon="damage">
          <DamageBreakdown p={p} maxTotal={maxima.damageToChampions} />
        </StatCell>
        <StatCell label="承受伤害" icon="taken">
          <StatBar value={p.damageTaken} max={maxima.damageTaken} />
        </StatCell>
        <StatCell label="伤害减免" icon="mitigate">
          <StatBar value={p.damageSelfMitigated} max={maxima.damageSelfMitigated} />
        </StatCell>
        <StatCell label="治疗量" icon="heal">
          <HealBreakdown p={p} maxTotal={maxima.heal} />
        </StatCell>
        <StatCell label="防御塔伤害" icon="tower">
          <StatBar value={p.turretDamage} max={maxima.turretDamage} />
        </StatCell>
        <StatCell label="控制时长" icon="cc">
          <StatBar value={p.ccTime} max={maxima.ccTime} suffix=" 秒" />
        </StatCell>
        <StatCell label="经济" icon="gold">
          <StatBar value={p.gold} max={maxima.gold} />
          <p className="px-2 pb-1.5 text-[10px] text-[var(--muted)]">已花 {p.goldSpent.toLocaleString("zh-CN")}</p>
        </StatCell>
        <StatCell label="连杀" icon="streak">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.killingSprees} 次</p>
            <p className="text-[10px] text-[var(--muted)]">最大 {p.largestKillingSpree} 连杀</p>
          </div>
        </StatCell>
        <StatCell label="资源偷取" icon="steal">
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-sm tabular-nums text-[var(--foreground)]">{p.objectivesStolen}</p>
          </div>
        </StatCell>
        <StatCell label="死亡时长" icon="skull">
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
const OBJECTIVE_ROWS: { key: ObjectiveKey; label: string; icon: string }[] = [
  { key: "tower", label: "防御塔", icon: "tower" },
  { key: "inhibitor", label: "水晶", icon: "crystal" },
  { key: "dragon", label: "小龙", icon: "dragon" },
  { key: "baron", label: "大龙", icon: "baron" },
  { key: "riftHerald", label: "峡谷先锋", icon: "herald" },
  { key: "atakhan", label: "阿塔坎", icon: "atakhan" },
  { key: "horde", label: "虚空幼虫", icon: "voidgrub" },
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
  icon,
  blue,
  red,
  formatValue,
  first,
}: {
  label: string;
  icon?: string;
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
      <span className="flex w-16 shrink-0 items-center justify-center gap-1 text-center text-[var(--muted)] sm:w-20">
        {icon ? <StatIcon name={icon} className="h-3 w-3 shrink-0 opacity-70" /> : null}
        {label}
      </span>
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

// Small line-icon set (abstract, not literal game icons) used purely as a
// scan aid next to stat/objective labels -- a label already says what the
// number is; the icon just breaks up rows of identical text so the eye can
// jump straight to "the healing row" or "the tower row" instead of reading
// every label. Kept in a single shared component + path table rather than
// one file per icon so this stays easy to extend.
const ICON_PATHS: Record<string, string> = {
  tower: "M9 21V10.5L6 8V4H8V6H16V4H18V8L15 10.5V21M6 21H18M9 14H15",
  crystal: "M12 3L18 9L15 21H9L6 9L12 3Z",
  dragon: "M12 4C7 4 4 8.5 4 13C4 16.5 7.5 19 12 19C16.5 19 20 16.5 20 13C20 8.5 17 4 12 4ZM9 10.5L9.5 8.5M15 10.5L14.5 8.5",
  herald: "M12 2.5L14.2 8.6L20.5 9.3L15.7 13.4L17.1 19.8L12 16.3L6.9 19.8L8.3 13.4L3.5 9.3L9.8 8.6L12 2.5Z",
  atakhan: "M12 3L20 8V16L12 21L4 16V8L12 3ZM12 3V21M4 8L20 16M20 8L4 16",
  voidgrub: "M4.5 15.5C4.5 10.5 8 6.5 12 6.5C16 6.5 19.5 10.5 19.5 15.5C19.5 18.5 16 20 12 20C8 20 4.5 18.5 4.5 15.5ZM9 12.5C9 13 9.5 13.5 10 13.5C10.5 13.5 11 13 11 12.5M13 12.5C13 13 13.5 13.5 14 13.5C14.5 13.5 15 13 15 12.5",
  kills: "M6.5 17.5L17 7M9 6.5H6.5V9M15 17.5H17.5V15M4 20L8 16",
  gold: "M12 3V21M8.5 6.8C8.5 5.4 10 4.3 12 4.3C14 4.3 15.5 5.6 15.5 7C15.5 8.4 14.2 8.9 12 9.4C9.8 9.9 8.5 10.6 8.5 12C8.5 13.4 10 14.7 12 14.7C14 14.7 15.5 13.6 15.5 12.2",
  damage: "M13 2.5L4.5 14H10.5L9.5 21.5L19 10H12.5L13 2.5Z",
  taken: "M12 3L19.5 6.2V11.2C19.5 15.9 16.3 19.7 12 21C7.7 19.7 4.5 15.9 4.5 11.2V6.2L12 3Z",
  heal: "M12 20C12 20 4.5 14.8 4.5 9.5C4.5 6.6 6.8 4.7 9.2 4.7C10.5 4.7 11.5 5.4 12 6.3C12.5 5.4 13.5 4.7 14.8 4.7C17.2 4.7 19.5 6.6 19.5 9.5C19.5 14.8 12 20 12 20Z",
  vision: "M2.5 12C2.5 12 6.5 5.5 12 5.5C17.5 5.5 21.5 12 21.5 12C21.5 12 17.5 18.5 12 18.5C6.5 18.5 2.5 12 2.5 12ZM12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15Z",
  mitigate: "M12 3L19.5 6.2V11.2C19.5 15.9 16.3 19.7 12 21C7.7 19.7 4.5 15.9 4.5 11.2V6.2L12 3ZM9 11.8L11 13.8L15.3 9.5",
  cs: "M12 20.5C7.5 20.5 4 17.3 4 13.2C4 9.1 7.5 5.9 12 5.9C16.5 5.9 20 9.1 20 13.2C20 17.3 16.5 20.5 12 20.5ZM9 13.2H15",
  cc: "M12 21.5C7.3 21.5 3.5 17.7 3.5 13C3.5 8.3 7.3 4.5 12 4.5C16.7 4.5 20.5 8.3 20.5 13C20.5 17.7 16.7 21.5 12 21.5ZM12 8.5V13L15 15",
  streak: "M12 2.3C12 2.3 6.3 8.3 6.3 14C6.3 17.4 8.8 19.8 12 19.8C15.2 19.8 17.7 17.4 17.7 14C17.7 8.3 12 2.3 12 2.3Z",
  steal: "M17.8 3.2L20.8 6.2L10.5 16.5L5.7 18.3L7.5 13.5L17.8 3.2Z",
  skull: "M12 3.3C7.4 3.3 4.5 6.7 4.5 10.9C4.5 13.7 5.9 15.6 7.3 16.6V19.5H10V17.6H14V19.5H16.7V16.6C18.1 15.6 19.5 13.7 19.5 10.9C19.5 6.7 16.6 3.3 12 3.3ZM9.7 11.3C9.7 11.8 10.1 12.2 10.6 12.2C11.1 12.2 11.5 11.8 11.5 11.3C11.5 10.8 11.1 10.4 10.6 10.4C10.1 10.4 9.7 10.8 9.7 11.3ZM12.5 11.3C12.5 11.8 12.9 12.2 13.4 12.2C13.9 12.2 14.3 11.8 14.3 11.3C14.3 10.8 13.9 10.4 13.4 10.4C12.9 10.4 12.5 10.8 12.5 11.3Z",
};

function StatIcon({ name, className = "h-3.5 w-3.5" }: { name: string; className?: string }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
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

  const totals: { label: string; icon: string; blue: number; red: number; formatValue?: (n: number) => string }[] = [
    { label: "总击杀", icon: "kills", blue: sumBy(teamA, (p) => p.kills), red: sumBy(teamB, (p) => p.kills) },
    {
      label: "总经济",
      icon: "gold",
      blue: sumBy(teamA, (p) => p.gold),
      red: sumBy(teamB, (p) => p.gold),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总伤害",
      icon: "damage",
      blue: sumBy(teamA, (p) => p.damageToChampions),
      red: sumBy(teamB, (p) => p.damageToChampions),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总承伤",
      icon: "taken",
      blue: sumBy(teamA, (p) => p.damageTaken),
      red: sumBy(teamB, (p) => p.damageTaken),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    {
      label: "总治疗",
      icon: "heal",
      blue: sumBy(teamA, (p) => p.heal),
      red: sumBy(teamB, (p) => p.heal),
      formatValue: (n) => n.toLocaleString("zh-CN"),
    },
    { label: "总视野", icon: "vision", blue: sumBy(teamA, (p) => p.visionScore), red: sumBy(teamB, (p) => p.visionScore) },
    {
      label: "总减伤",
      icon: "mitigate",
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
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">目标</p>
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
                    icon={row.icon}
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

        <div className="mt-4 border-t border-[var(--border)]/40 pt-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">团队汇总</p>
          <div className="space-y-1.5">
            {totals.map((row) => (
              <CompareRow key={row.label} label={row.label} icon={row.icon} blue={row.blue} red={row.red} formatValue={row.formatValue} />
            ))}
          </div>
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
