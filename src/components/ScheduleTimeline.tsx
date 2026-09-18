import Image from "next/image";
import { formatMinutes, MINUTES_PER_DAY, TIME_STEP_MINUTES } from "@/lib/time";

type TimelineEntry = {
  member: string;
  startMinute: number;
  endMinute: number;
};

const BUCKETS = MINUTES_PER_DAY / TIME_STEP_MINUTES; // 288, 5-minute resolution
const HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

function pct(minute: number) {
  return (minute / MINUTES_PER_DAY) * 100;
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

export default function ScheduleTimeline({
  signups,
  photoByMember,
}: {
  signups: { member: string; startMinute: number | null; endMinute: number | null }[];
  photoByMember: Record<string, string>;
}) {
  const entries: TimelineEntry[] = signups
    .filter(
      (s): s is TimelineEntry & { member: string } =>
        s.startMinute !== null && s.endMinute !== null && s.endMinute > s.startMinute
    )
    .map((s) => ({ member: s.member, startMinute: s.startMinute as number, endMinute: s.endMinute as number }));

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-6 text-center text-sm text-[var(--muted)] shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        还没有人填预约时间段，填了之后这里会显示一条当天的时间线。
      </div>
    );
  }

  const { segments, maxCount, peak } = buildOverlap(entries);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
          当天时间线
        </p>
        {peak ? (
          <span className="rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            人最多的时段：{formatMinutes(peak.startMinute)}–{formatMinutes(peak.endMinute)} · {maxCount} 人同时在线
          </span>
        ) : null}
      </div>

      <div className="pl-20 sm:pl-28">
        <div className="relative h-4 text-[10px] text-[var(--muted)]">
          {HOUR_TICKS.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(h * 60)}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* One row per person with a booking window */}
      <div className="mt-1 space-y-2">
        {entries.map((e) => (
          <div key={e.member} className="flex items-center gap-3">
            <div className="flex w-16 shrink-0 items-center gap-2 sm:w-24">
              {photoByMember[e.member] ? (
                <span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--border)]">
                  <Image src={photoByMember[e.member]} alt={e.member} fill className="object-cover" sizes="24px" />
                </span>
              ) : null}
              <span className="truncate text-xs text-[var(--foreground)]">{e.member}</span>
            </div>
            <div className="relative h-6 flex-1 rounded-sm bg-white/[0.03]">
              <div
                className="absolute inset-y-0 flex items-center justify-center rounded-sm border border-[var(--gold)]/60 bg-[var(--gold)]/25 px-1 text-[10px] font-medium text-[var(--gold-soft)]"
                style={{
                  left: `${pct(e.startMinute)}%`,
                  width: `${Math.max(pct(e.endMinute - e.startMinute), 3)}%`,
                }}
              >
                <span className="truncate">
                  {formatMinutes(e.startMinute)}–{formatMinutes(e.endMinute)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overlap heat strip -- darker = more people booked at that time */}
      <div className="mt-4 pl-20 sm:pl-28">
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
                    left: `${pct(seg.startMinute)}%`,
                    width: `${pct(seg.endMinute - seg.startMinute)}%`,
                    backgroundColor: `rgba(231, 182, 85, ${alpha})`,
                  }}
                  title={`${formatMinutes(seg.startMinute)}–${formatMinutes(seg.endMinute)} · ${seg.count} 人`}
                />
              );
            })}
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">颜色越深，同时预约的人越多</p>
      </div>
    </div>
  );
}
