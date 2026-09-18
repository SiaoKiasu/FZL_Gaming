import Link from "next/link";
import { isDbConfigured } from "@/lib/db";
import { beijingDateString, getSignupDatesInRange, getSignupsForDate } from "@/lib/schedule";
import { POSITION_LABEL, isPosition } from "@/lib/positions";
import { roster } from "@/lib/roster";
import championMap from "@/data/champions.json";
import Pill from "@/components/Pill";
import ScheduleSignupForm from "@/components/ScheduleSignupForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "赛程 · FZL Gaming",
};

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, delta: number) {
  const [y, m] = dateStr.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

function buildMonthGrid(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const startOffset = first.getUTCDay();
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - startOffset);
  const totalDaysNeeded = startOffset + last.getUTCDate();
  const rows = Math.ceil(totalDaysNeeded / 7);
  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    cells.push({ date: isoDate(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 });
  }
  return cells;
}

function formatHeaderDate(dateStr: string) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}月${d}日`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const today = beijingDateString();
  const selectedDate = rawDate && DATE_RE.test(rawDate) ? rawDate : today;
  const [year, month] = selectedDate.split("-").map(Number);

  const dbReady = isDbConfigured();
  const grid = buildMonthGrid(selectedDate);
  const gridStart = grid[0].date;
  const gridEnd = grid[grid.length - 1].date;

  const [signups, markedDates] = dbReady
    ? await Promise.all([getSignupsForDate(selectedDate), getSignupDatesInRange(gridStart, gridEnd)])
    : [[], new Set<string>()];

  const members = roster.map((p) => p.nickname);
  const championOptions = Array.from(new Set(Object.values(championMap as Record<string, string>))).sort(
    (a, b) => a.localeCompare(b, "zh-Hans-CN")
  );
  const existingByMember = Object.fromEntries(
    signups.map((s) => [s.member, { position: s.position, champions: s.champions, declaration: s.declaration }])
  );

  const prevMonth = addMonths(selectedDate, -1);
  const nextMonth = addMonths(selectedDate, 1);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
          Daily Sign-up
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">赛程</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">预约今晚开黑，报位置、选英雄意向，留一句今日宣言。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href={`/schedule?date=${prevMonth}`}
              className="rounded-sm border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)] transition hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
            >
              ←
            </Link>
            <p className="font-display text-sm font-bold tracking-wide">
              {year} 年 {month} 月
            </p>
            <Link
              href={`/schedule?date=${nextMonth}`}
              className="rounded-sm border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)] transition hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
            >
              →
            </Link>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--muted)]">
            {WEEKDAY_LABEL.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
            {grid.map((cell) => {
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === today;
              const hasSignups = markedDates.has(cell.date);
              return (
                <Link
                  key={cell.date}
                  href={`/schedule?date=${cell.date}`}
                  className={`relative flex aspect-square items-center justify-center rounded-sm text-xs transition ${
                    isSelected
                      ? "bg-[var(--gold)] font-bold text-[#0a0f1e]"
                      : cell.inMonth
                        ? "text-[var(--foreground)] hover:bg-[var(--gold)]/10"
                        : "text-[var(--muted)]/40 hover:bg-[var(--gold)]/5"
                  } ${isToday && !isSelected ? "ring-1 ring-inset ring-[var(--gold)]/60" : ""}`}
                >
                  {cell.day}
                  {hasSignups ? (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        isSelected ? "bg-[#0a0f1e]" : "bg-[var(--gold)]"
                      }`}
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>

          {selectedDate !== today ? (
            <Link
              href={`/schedule?date=${today}`}
              className="mt-3 block text-center text-xs text-[var(--gold)] hover:text-[var(--gold-soft)]"
            >
              回到今天
            </Link>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-xl font-bold">{formatHeaderDate(selectedDate)} 预约名单</h2>
              {selectedDate === today ? <Pill tone="good">今天</Pill> : null}
            </div>

            {!dbReady ? (
              <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
                数据库还没接好，部署到 Vercel 并接上 Postgres 存储后，这里会显示大家的预约。
              </p>
            ) : signups.length === 0 ? (
              <p className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)]">
                还没有人预约这天，第一个来出声。
              </p>
            ) : (
              <div className="space-y-3">
                {signups.map((s) => (
                  <div
                    key={s.member}
                    className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-[var(--foreground)]">{s.member}</span>
                      {isPosition(s.position) ? (
                        <Pill tone="neutral">{POSITION_LABEL[s.position]}</Pill>
                      ) : null}
                      {s.champions.map((c) => (
                        <Pill key={c} tone="warning">
                          {c}
                        </Pill>
                      ))}
                    </div>
                    {s.declaration ? (
                      <p className="mt-2 text-sm italic text-[var(--muted)]">「{s.declaration}」</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ScheduleSignupForm
            date={selectedDate}
            members={members}
            championOptions={championOptions}
            existingByMember={existingByMember}
          />
        </div>
      </div>
    </div>
  );
}
