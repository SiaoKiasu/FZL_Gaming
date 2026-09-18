import {
  fundMeta,
  awardRules,
  memberDues,
  memberIdMap,
  settlement,
  ledger,
  currentBalance,
} from "@/lib/fund";
import { getLiveMemberStats, type LiveMemberStat } from "@/lib/fundStats";
import ShareBar from "@/components/ShareBar";
import StatTile from "@/components/StatTile";
import Pill from "@/components/Pill";

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
  const liveStats = await getLiveMemberStats();
  const memberStats = liveStats ?? EMPTY_STATS;
  const paidCount = memberDues.filter((m) => m.status === "已缴").length;
  const totalDues = memberDues.reduce((sum, m) => sum + m.amount, 0);
  const hasMatchData = memberStats.some((s) => s.rankedGames > 0 || s.teamGames > 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
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

      {/* Ranked stats */}
      <section className="mb-16">
        <h2 className="font-display mb-1 text-2xl font-bold">排位数据统计</h2>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {liveStats
            ? "数据来自「战绩」页同步下来的对局记录，每次同步后自动更新（峡谷之巅：420/440 队列且车队五人同排；常驻嘉宾：任意已同步模式且车队三人及以上同队）。"
            : "数据库还没接好，暂时显示占位结构；接上 Postgres 并同步过战绩后，这里会自动统计。"}
        </p>
        <div className="overflow-x-auto rounded-sm border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--bg-panel)] text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">成员</th>
                <th className="px-4 py-3 font-medium">五黑排位局数</th>
                <th className="px-4 py-3 font-medium">MVP</th>
                <th className="px-4 py-3 font-medium">SVP</th>
                <th className="px-4 py-3 font-medium">平均 MVP 率</th>
                <th className="px-4 py-3 font-medium">达标（峡谷之巅）</th>
                <th className="px-4 py-3 font-medium">全模式局数（常驻嘉宾）</th>
              </tr>
            </thead>
            <tbody>
              {[...memberStats]
                .sort((a, b) => b.mvpRate - a.mvpRate || b.rankedGames - a.rankedGames)
                .map((s) => (
                <tr
                  key={s.nickname}
                  className="border-t border-[var(--border)] text-[var(--muted)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                    {s.nickname}
                  </td>
                  <td className="px-4 py-3">{s.rankedGames}</td>
                  <td className="px-4 py-3">{s.mvp}</td>
                  <td className="px-4 py-3">{s.svp}</td>
                  <td className="px-4 py-3">
                    {(s.mvpRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={s.qualified ? "good" : "neutral"}>
                      {s.qualified ? "达标" : "未达标"}
                    </Pill>
                  </td>
                  <td className="px-4 py-3">{s.teamGames}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
