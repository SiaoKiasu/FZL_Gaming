import Image from "next/image";
import { addDays, formatShortDate } from "@/lib/date";
import { crossesMidnight, effectiveEndMinute, formatMinutes, MINUTES_PER_DAY, TIME_STEP_MINUTES } from "@/lib/time";

type TimelineEntry = {
  member: string;
  // Raw wall-clock minute the booking starts at, always within one day
  // (0-1435).
  startMinute: number;
  // "Effective" end -- extended past MINUTES_PER_DAY when the booking
  // crosses midnight, so every range/overlap calculation below can treat
  // it as one continuous span instead of the clock wrapping back below
  // startMinute. Recover the real end-of-day clock time for display with
  // `endMinute % MINUTES_PER_DAY`.
  endMinute: number;
  // Display string for the end time -- just "HH:MM", or "M月D日 HH:MM"
  // when the booking crosses midnight, so it's never ambiguous which day
  // it lands on.
  endLabel: string;
};

// Two days' worth of 5-minute buckets so a booking that crosses midnight
// (end > MINUTES_PER_DAY in "effective" terms) still fits on the axis.
const BUCKETS = (2 * MINUTES_PER_DAY) / TIME_STEP_MINUTES; // 576, 5-minute resolution
const PAD_HOURS = 1;
const MIN_SPAN_MINUTES = 4 * 60; // don't zoom in tighter than a 4-hour window

function pct(minute: number, rangeStart: number, rangeSpan: number) {
  return ((minute - rangeStart) / rangeSpan) * 100;
}

/** Render an "effective" minute (possibly past MINUTES_PER_DAY, for a
 * window that crosses midnight) back to its real clock time, prefixed with
 * the actual next-day date once it's past midnight. */
function formatClock(m: number, date: string) {
  const clock = formatMinutes(m % MINUTES_PER_DAY);
  return m >= MINUTES_PER_DAY ? `${formatShortDate(addDays(date, 1))} ${clock}` : clock;
}

/** Only the evening (or whenever) window people actually booked has anything
 * to show -- displaying the full 0-24 axis wastes most of the width on
 * empty hours. Zoom to the booked range plus an hour of padding either
 * side, snapped to whole hours so the tick axis stays tidy. */
function computeRange(entries: TimelineEntry[]) {
  const minStart = Math.min(...entries.map((e) => e.startMinute));
  const maxEnd = Math.max(...entries.map((e) => e.endMinute));
  let rangeStart = Math.max(0, Math.floor(minStart / 60) * 60 - PAD_HOURS * 60);
  let rangeEnd = Math.min(2 * MINUTES_PER_DAY, Math.ceil(maxEnd / 60) * 60 + PAD_HOURS * 60);
  if (rangeEnd - rangeStart < MIN_SPAN_MINUTES) {
    const mid = (rangeStart + rangeEnd) / 2;
    rangeEnd = Math.min(2 * MINUTES_PER_DAY, Math.floor((mid + MIN_SPAN_MINUTES / 2) / 60) * 60);
    rangeStart = Math.max(0, rangeEnd - MIN_SPAN_MINUTES);
  }
  return { rangeStart, rangeEnd };
}

function buildHourTicks(rangeStart: number, rangeEnd: number) {
  const spanHours = (rangeEnd - rangeStart) / 60;
  const step = spanHours <= 5 ? 1 : spanHours <= 10 ? 2 : spanHours <= 18 ? 3 : 4;
  const ticks: number[] = [];
  for (let h = rangeStart / 60; h < rangeEnd / 60; h += step) ticks.push(h);
  const lastHour = rangeEnd / 60;
  if (ticks[ticks.length - 1] !== lastHour) ticks.push(lastHour);
  return ticks;
}

/** Run-length-encode the per-bucket overlap count into colored segments,
 * and find the longest stretch at the maximum concurrent-booking count. */
function buildOverlap(entries: TimelineEntry[]) {
  const counts = new Array<number>(BUCKETS).fill(0);
  for (const e of entries) {
    const from = Math.max(0, Math.floor(e.startMinute / TIME_STEP_MINUTES));
    const to = Math.min(BUCKETS, Math.ceil(e.endMinute / TIME_STEP_MINUTES));
    for (let i = from; i < to; i++) counts[i]++;
  }

  const maxCount = Math.max(0, ...counts);

  const segments: { startMinute: number; endMinute: number; count: number }[] = [];
  let i = 0;
  while (i < BUCKETS) {
    let j = i;
    while (j < BUCKETS && counts[j] === counts[i]) j++;
    segments.push({ startMinute: i * TIME_STEP_MINUTES, endMinute: j * TIME_STEP_MINUTES, count: counts[i] });
    i = j;
  }

  // Longest contiguous run at the max count -- the headline "most people
  // online at once" window. Ties broken by taking the first (earliest).
  let peak: { startMinute: number; endMinute: number } | null = null;
  if (maxCount > 0) {
    let best = { start: -1, len: 0 };
    let curStart = -1;
    let curLen = 0;
    for (let k = 0; k <= BUCKETS; k++) {
      if (k < BUCKETS && counts[k] === maxCount) {
        if (curLen === 0) curStart = k;
        curLen++;
      } else {
        if (curLen > best.len) best = { start: curStart, len: curLen };
        curLen = 0;
      }
    }
    peak = { startMinute: best.start * TIME_STEP_MINUTES, endMinute: (best.start + best.len) * TIME_STEP_MINUTES };
  }

  return { segments, maxCount, peak };
}

function BookingBar({
  entry,
  rangeStart,
  rangeSpan,
}: {
  entry: TimelineEntry;
  rangeStart: number;
  rangeSpan: number;
}) {
  const left = pct(entry.startMinute, rangeStart, rangeSpan);
  const width = Math.max(pct(entry.endMinute, rangeStart, rangeSpan) - left, 2);
  const label = `${formatMinutes(entry.startMinute)}–${entry.endLabel}`;
  // Keep the time-range text outside the highlighted block itself so it's
  // never clipped by a narrow bar -- flip it to the other side once the
  // bar runs past ~70% of the track so it doesn't fall off the right edge.
  const labelOnRight = left + width <= 70;
  return (
    <div className="relative h-6 flex-1 rounded-sm bg-white/[0.03]">
      <div
        className="absolute inset-y-0 rounded-sm border border-[var(--gold)]/60 bg-[var(--gold)]/25"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <span
        className={`absolute inset-y-0 flex items-center whitespace-nowrap text-[10px] font-medium text-[var(--gold-soft)] ${
          labelOnRight ? "" : "justify-end"
        }`}
        style={labelOnRight ? { left: `calc(${left + width}% + 6px)` } : { right: `calc(${100 - left}% + 6px)` }}
      >
        {label}
      </span>
    </div>
  );
}

export default function ScheduleTimeline({
  date,
  signups,
  photoByMember,
}: {
  /** The signups' own calendar date ("YYYY-MM-DD"), so a booking that
   * crosses midnight can be labeled with the actual next-day date. */
  date: string;
  signups: { member: string; startMinute: number | null; endMinute: number | null }[];
  photoByMember: Record<string, string>;
}) {
  const entries: TimelineEntry[] = signups
    .filter(
      (s): s is { member: string; startMinute: number; endMinute: number } =>
        s.startMinute !== null && s.endMinute !== null && s.startMinute !== s.endMinute
    )
    .map((s) => ({
      member: s.member,
      startMinute: s.startMinute,
      endMinute: effectiveEndMinute(s.startMinute, s.endMinute),
      endLabel: crossesMidnight(s.startMinute, s.endMinute)
        ? `${formatShortDate(addDays(date, 1))} ${formatMinutes(s.endMinute)}`
        : formatMinutes(s.endMinute),
    }));

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)] shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        还没有人填预约时间段，填了之后这里会显示一条当天的时间线。
      </div>
    );
  }

  const { segments, maxCount, peak } = buildOverlap(entries);
  const { rangeStart, rangeEnd } = computeRange(entries);
  const rangeSpan = rangeEnd - rangeStart;
  const hourTicks = buildHourTicks(rangeStart, rangeEnd);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
          当天时间线
        </p>
        {peak ? (
          <span className="rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            人最多的时段：{formatClock(peak.startMinute, date)}–{formatClock(peak.endMinute, date)} · {maxCount} 人同时在线
          </span>
        ) : null}
      </div>

      {/* Label column is avatar-only on mobile (no room to also spell out
          names once the bars need real width) and gains the name at sm+. */}
      <div className="pl-9 sm:pl-28">
        <div className="relative h-4 text-[10px] text-[var(--muted)]">
          {hourTicks.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(h * 60, rangeStart, rangeSpan)}%` }}
            >
              {h % 24}
            </span>
          ))}
        </div>
      </div>

      {/* One row per person with a booking window */}
      <div className="mt-1 space-y-2">
        {entries.map((e) => (
          <div key={e.member} className="flex items-center gap-2 sm:gap-3">
            <div className="flex w-9 shrink-0 items-center gap-2 sm:w-24">
              {photoByMember[e.member] ? (
                <span
                  className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--border)]"
                  title={e.member}
                >
                  <Image src={photoByMember[e.member]} alt={e.member} fill className="object-cover" sizes="24px" />
                </span>
              ) : (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[9px] text-[var(--muted)]"
                  title={e.member}
                >
                  {e.member.slice(0, 1)}
                </span>
              )}
              <span className="hidden truncate text-xs text-[var(--foreground)] sm:inline">{e.member}</span>
            </div>
            <BookingBar entry={e} rangeStart={rangeStart} rangeSpan={rangeSpan} />
          </div>
        ))}
      </div>

      {/* Overlap heat strip -- darker = more people booked at that time */}
      <div className="mt-4 pl-9 sm:pl-28">
        <div className="relative h-3 overflow-hidden rounded-sm bg-white/[0.03]">
          {segments
            .filter((seg) => seg.count > 0)
            .map((seg, i) => {
              const isPeak = peak && seg.count === maxCount;
              const alpha = 0.18 + 0.62 * (seg.count / Math.max(maxCount, 1));
              return (
                <div
                  key={i}
                  className={`absolute inset-y-0 ${isPeak ? "ring-1 ring-inset ring-[var(--gold)]" : ""}`}
                  style={{
                    left: `${pct(seg.startMinute, rangeStart, rangeSpan)}%`,
                    width: `${pct(seg.endMinute, rangeStart, rangeSpan) - pct(seg.startMinute, rangeStart, rangeSpan)}%`,
                    backgroundColor: `rgba(231, 182, 85, ${alpha})`,
                  }}
                  title={`${formatClock(seg.startMinute, date)}–${formatClock(seg.endMinute, date)} · ${seg.count} 人`}
                />
              );
            })}
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">颜色越深，同时预约的人越多</p>
      </div>
    </div>
  );
}
