import {
  fundMeta,
  awardRules,
  memberDues,
  memberIdMap,
  settlement,
  ledger as staticLedger,
  currentBalance as staticBalance,
} from "@/lib/fund";
import { getLiveMemberStats, type LiveMemberStat, CANYON_PEAK_MIN_GAMES } from "@/lib/fundStats";
import { getLedgerEntries, getLedgerPasswordHash, isDbConfigured, type LedgerEntry } from "@/lib/db";
import { beijingDateString } from "@/lib/schedule";
import ShareBar from "@/components/ShareBar";
import StatTile from "@/components/StatTile";
import Pill from "@/components/Pill";
import LedgerForm from "@/components/LedgerForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "峡谷基金 · FZL Gaming",
};

const seriesColors = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
];

function gameIdOf(nickname: string) {
  return memberIdMap.find((m) => m.nickname === nickname)?.gameId ?? null;
}

// Placeholder shown until a first sync has run (or when the local dev
// environment has no POSTGRES_URL) — same all-zero shape as before, just
// derived rather than hand-maintained.
const EMPTY_STATS: LiveMemberStat[] = memberIdMap.map((m) => ({
  nickname: m.nickname,
  gameId: m.gameId,
  rankedGames: 0,
  mvp: 0,
  svp: 0,
  mvpRate: 0,
  svpRate: 0,
  qualified: false,
  teamGames: 0,
}));

export default async function FundPage() {
  const dbReady = isDbConfigured();
  const [liveStats, ledgerEntries, ledgerPasswordHash] = await Promise.all([
    getLiveMemberStats(),
    dbReady ? getLedgerEntries() : Promise.resolve<LedgerEntry[]>([]),
    dbReady ? getLedgerPasswordHash() : Promise.resolve<string | null>(null),
  ]);
  const memberStats = liveStats ?? EMPTY_STATS;
  const paidCount = memberDues.filter((m) => m.status === "已缴").length;
  const totalDues = memberDues.reduce((sum, m) => sum + m.amount, 0);
  const hasMatchData = memberStats.some((s) => s.rankedGames > 0 || s.teamGames > 0);
  // Once the DB has been migrated (db/schema_ledger.sql seeds the one old
  // static row into it), live entries take over; the static fallback only
  // matters for local dev with no POSTGRES_URL.
  const ledger = dbReady && ledgerEntries.length ? ledgerEntries : staticLedger;
  const currentBalance = dbReady && ledgerEntries.length ? ledgerEntries[ledgerEntries.length - 1].balance : staticBalance;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-4 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
          Team Prize Fund
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">
          {fundMeta.name}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {fundMeta.trialPeriod} · 保管人 {fundMeta.keeper} ·{" "}
          {fundMeta.settlementCycle}
        </p>
      </div>

      {/* Overview stat tiles */}
      <div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="奖金池"
          value={`¥${settlement.pool}`}
          hint={`实收 ¥${settlement.totalCollected} − 设备费 ¥${settlement.equipmentCost}`}
        />
        <StatTile
          label="缴费进度"
          value={`${paidCount}/${fundMeta.participantCount}`}
          hint={`每人 ¥${fundMeta.duesPerPerson}/月`}
        />
        <StatTile
          label="当前结余"
          value={`¥${currentBalance}`}
          hint="见收支流水"
        />
        <StatTile
          label="结算月份"
          value={settlement.month}
          hint="月度结算"
        />
      </div>

      {/* Award rules & split */}
      <section className="mb-16">
        <h2 className="font-display mb-1 text-2xl font-bold">奖金池分配规则</h2>
        <p className="mb-6 text-sm text-[var(--muted)]">
          资金用途：设备费优先，剩余全部进奖金池；下面比例为规则说明中约定的分配。
        </p>

        <div className="mb-8 rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6">
          <ShareBar
            segments={awardRules.map((a, i) => ({
              label: a.name,
              value: a.share,
              color: seriesColors[i],
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {awardRules.map((a, i) => (
            <div
              key={a.id}
              className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{a.name}</h3>
                <span
                  className="rounded-sm px-2 py-0.5 text-xs font-bold"
                  style={{
                    color: seriesColors[i],
                    backgroundColor: `color-mix(in srgb, ${seriesColors[i]} 15%, transparent)`,
                  }}
                >
                  {(a.share * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mb-2 text-sm text-[var(--gold-soft)]">
                {a.basis}
              </p>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {a.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Dues status */}
      <section className="mb-16">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">本月缴费情况</h2>
          <span className="text-sm text-[var(--muted)]">
            合计 ¥{totalDues} · {paidCount}/{fundMeta.participantCount} 人已缴
          </span>
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[var(--status-good)]"
            style={{
              width: `${(paidCount / fundMeta.participantCount) * 100}%`,
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {memberDues.map((m) => (
            <div
              key={m.nickname}
              className="flex items-center justify-between rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3"
            >
              <div>
                <p className="font-medium">{m.nickname}</p>
                <p className="text-xs text-[var(--muted)]">
                  {gameIdOf(m.nickname) ?? "—"}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              </div>
              <div className="text-right">
                <Pill tone={m.status === "已缴" ? "good" : "warning"}>
                  {m.status}
                </Pill>
                {m.paidOn ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {m.paidOn}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* This month's settlement */}
      <section className="mb-16">
        <h2 className="font-display mb-1 text-2xl font-bold">
          {settlement.month} 奖金结算
        </h2>
        <p className="mb-6 text-sm text-[var(--muted)]">
          奖金池 ¥{settlement.pool}，
          {hasMatchData
            ? "下方「排位数据统计」已有实时数据，具体获奖人与发放以保管人确认为准。"
            : "试运行首月暂无对局数据，全部奖项尚未发放。"}
        </p>
        <div className="overflow-x-auto rounded-sm border border-[var(--border)]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[var(--bg-panel)] text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">奖项</th>
                <th className="px-4 py-3 font-medium">占比</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">获奖人</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {settlement.awards.map((a) => (
                <tr
                  key={a.name}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {(a.share * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 font-display font-semibold text-[var(--gold)]">
                    ¥{a.amount}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {a.winner ?? "评选中"}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone="warning">{a.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] bg-[var(--bg-panel)]">
                <td className="px-4 py-3 font-semibold">合计</td>
                <td className="px-4 py-3 text-[var(--muted)]">100%</td>
                <td className="px-4 py-3 font-display font-semibold">
                  ¥{settlement.pool}
                </td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Per-award stats -- 峡谷之巅/常驻嘉宾 computed live from synced
          matches; 天选之子 (天命杯) stays manual, see note below. */}
      <section className="mb-16">
        <h2 className="font-display mb-1 text-2xl font-bold">评选统计</h2>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {liveStats
            ? "峡谷之巅、常驻嘉宾两项数据来自「战绩」页同步下来的对局记录，每次同步后自动更新。"
            : "数据库还没接好，暂时显示占位结构；接上 Postgres 并同步过战绩后，这里会自动统计。"}
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* 峡谷之巅 */}
          <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold">峡谷之巅</h3>
              <span
                className="rounded-sm px-2 py-0.5 text-xs font-bold"
                style={{ color: seriesColors[0], backgroundColor: `color-mix(in srgb, ${seriesColors[0]} 15%, transparent)` }}
                title="该项奖金占奖金池的固定比例，与下方任何人的数据无关"
              >
                奖池 35%
              </span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
              五黑排位平均 MVP 率最高者（当月需满 5 局）
            </p>
            {(() => {
              const sorted = [...memberStats].sort(
                (a, b) => b.mvpRate - a.mvpRate || b.rankedGames - a.rankedGames
              );
              const leaderId = sorted.find((s) => s.qualified)?.nickname;
              if (!sorted.some((s) => s.rankedGames > 0)) {
                return (
                  <p className="rounded-sm border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
                    还没有五黑排位对局，同步后自动出现。
                  </p>
                );
              }
              return (
                <div className="space-y-1.5">
                  {sorted.map((s) => (
                    <div
                      key={s.nickname}
                      className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-sm px-2 py-1.5 text-xs ${
                        s.nickname === leaderId ? "bg-[var(--gold)]/10" : ""
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 font-medium ${s.nickname === leaderId ? "text-[var(--gold)]" : "text-[var(--foreground)]"}`}>
                        {s.nickname}
                        {s.nickname === leaderId ? " 👑" : ""}
                        {!s.qualified && s.rankedGames > 0 ? (
                          <span className="rounded-sm border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--muted)]">
                            未达标 · 差{Math.max(CANYON_PEAK_MIN_GAMES - s.rankedGames, 0)}局
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-[var(--muted)]">
                        {s.rankedGames} 局 · MVP {s.mvp} · SVP {s.svp} · {(s.mvpRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  {!leaderId ? (
                    <p className="pt-1 text-[11px] text-[var(--muted)]">还没有人满足参评门槛（需满 5 局）。</p>
                  ) : null}
                </div>
              );
            })()}
          </div>

          {/* 天选之子 -- 天命杯是队内另外组织的临时抽签赛制，不在同步的战绩数据里 */}
          <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold">天选之子</h3>
              <span
                className="rounded-sm px-2 py-0.5 text-xs font-bold"
                style={{ color: seriesColors[1], backgroundColor: `color-mix(in srgb, ${seriesColors[1]} 15%, transparent)` }}
                title="该项奖金占奖金池的固定比例"
              >
                奖池 30%
              </span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
              月内「天命杯」累计 MVP 数最多者
            </p>
            <p className="rounded-sm border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
              天命杯是队内另外组织的临时抽签赛制，不在同步的战绩数据里，无法自动统计——由保管人根据天命杯记录手动登记。
            </p>
            {(() => {
              const award = settlement.awards.find((a) => a.name === "天选之子");
              return award ? (
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">当前获奖人</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--foreground)]">{award.winner ?? "评选中"}</span>
                    <Pill tone="warning">{award.status}</Pill>
                  </span>
                </div>
              ) : null;
            })()}
          </div>

          {/* 常驻嘉宾 */}
          <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold">常驻嘉宾</h3>
              <span
                className="rounded-sm px-2 py-0.5 text-xs font-bold"
                style={{ color: seriesColors[2], backgroundColor: `color-mix(in srgb, ${seriesColors[2]} 15%, transparent)` }}
                title="该项奖金占奖金池的固定比例"
              >
                奖池 15%
              </span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
              三人及以上任意模式，参与局数最多者
            </p>
            {(() => {
              const sorted = [...memberStats].sort((a, b) => b.teamGames - a.teamGames);
              const leaderId = sorted[0]?.teamGames > 0 ? sorted[0].nickname : undefined;
              if (!sorted.some((s) => s.teamGames > 0)) {
                return (
                  <p className="rounded-sm border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
                    还没有三人以上同队的对局，同步后自动出现。
                  </p>
                );
              }
              return (
                <div className="space-y-1.5">
                  {sorted.map((s) => (
                    <div
                      key={s.nickname}
                      className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-sm px-2 py-1.5 text-xs ${
                        s.nickname === leaderId ? "bg-[var(--gold)]/10" : ""
                      }`}
                    >
                      <span className={`font-medium ${s.nickname === leaderId ? "text-[var(--gold)]" : "text-[var(--foreground)]"}`}>
                        {s.nickname}
                        {s.nickname === leaderId ? " 👑" : ""}
                      </span>
                      <span className="tabular-nums text-[var(--muted)]">{s.teamGames} 局</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">收支流水</h2>
          <span className="font-display text-lg font-semibold text-[var(--gold)]">
            当前余额 ¥{currentBalance}
          </span>
        </div>

        {dbReady ? (
          <div className="mb-6">
            <LedgerForm passwordSet={Boolean(ledgerPasswordHash)} initialDate={beijingDateString()} />
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-sm border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--bg-panel)] text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">事项</th>
                <th className="px-4 py-3 font-medium">收入</th>
                <th className="px-4 py-3 font-medium">支出</th>
                <th className="px-4 py-3 font-medium">余额</th>
                <th className="px-4 py-3 font-medium">经手人</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 text-[var(--muted)]">{e.date}</td>
                  <td className="px-4 py-3">
                    <Pill tone={e.type === "收入" ? "good" : "neutral"}>
                      {e.type}
                    </Pill>
                  </td>
                  <td className="px-4 py-3">{e.item}</td>
                  <td className="px-4 py-3 text-[var(--status-good)]">
                    {e.income ? `+${e.income}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {e.expense ? `-${e.expense}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{e.balance}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {e.handler}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
