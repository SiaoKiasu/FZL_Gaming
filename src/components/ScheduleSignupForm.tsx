"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { POSITIONS, POSITION_LABEL } from "@/lib/positions";
import { addDays, formatShortDate } from "@/lib/date";
import { formatMinutes, MAX_MINUTE, parseTimeString, roundToStep } from "@/lib/time";
import ChampionCombobox from "@/components/ChampionCombobox";

// Half-hour candidates across the whole day, offered via <datalist> so the
// native time picker shows quick options without losing free entry -- any
// 5-minute-aligned value still works, this is just a shortlist.
const TIME_CANDIDATES = Array.from({ length: Math.floor(MAX_MINUTE / 30) + 1 }, (_, i) =>
  formatMinutes(Math.min(i * 30, MAX_MINUTE))
);

type ExistingSignup = {
  position: string;
  champions: string[];
  declaration: string;
  startMinute: number | null;
  endMinute: number | null;
};

export default function ScheduleSignupForm({
  date,
  member,
  existingByMember,
}: {
  date: string;
  /** The logged-in member. The form is only rendered when someone is. */
  member: string;
  existingByMember: Record<string, ExistingSignup>;
}) {
  const router = useRouter();
  const mine = existingByMember[member];
  const [position, setPosition] = useState(mine?.position ?? "");
  const [champ1, setChamp1] = useState(mine?.champions[0] ?? "");
  const [champ2, setChamp2] = useState(mine?.champions[1] ?? "");
  const [champ3, setChamp3] = useState(mine?.champions[2] ?? "");
  const [declaration, setDeclaration] = useState(mine?.declaration ?? "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");


  // Native time pickers don't reliably enforce `step` across browsers, so
  // snap to the nearest 5-minute mark ourselves when the field loses focus.
  function snapTime(value: string, set: (v: string) => void) {
    const m = parseTimeString(value);
    if (m === null) return;
    set(formatMinutes(roundToStep(m)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !position) return;
    setStatus("loading");
    setError("");
    try {
      const resp = await fetch("/api/schedule/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          position,
          champions: [champ1, champ2, champ3],
          declaration,
          startTime: startTime || null,
          endTime: endTime || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "预约失败");
        setStatus("error");
        return;
      }
      setStatus("done");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
      setStatus("error");
    }
  }

  const startAsMinute = parseTimeString(startTime);
  const endAsMinute = parseTimeString(endTime);
  const crossesMidnight =
    startAsMinute !== null && endAsMinute !== null && endAsMinute <= startAsMinute;

  const champInputClass =
    "w-full rounded-sm border border-[var(--border)] bg-[#0a0f1e] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
    >
      <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
        预约今晚
      </p>

      <p className="mt-3 text-xs text-[var(--muted)]">
        以 <span className="text-[var(--gold-soft)]">{member}</span> 的身份预约
      </p>

      <div className="mt-5">
        <p className="mb-2 text-xs text-[var(--muted)]">预约位置</p>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                position === p
                  ? "border-[var(--gold)] bg-[var(--gold)] text-[#0a0f1e]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
              }`}
            >
              {POSITION_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs text-[var(--muted)]">预约时间段</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="time"
            step={300}
            list="fzl-time-options"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onBlur={(e) => snapTime(e.target.value, setStartTime)}
            className={champInputClass + " w-32"}
          />
          <span className="text-sm text-[var(--muted)]">至</span>
          <input
            type="time"
            step={300}
            list="fzl-time-options"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            onBlur={(e) => snapTime(e.target.value, setEndTime)}
            className={champInputClass + " w-32"}
          />
          {startTime && endTime ? (
            <span className="text-xs text-[var(--gold)]">
              {startTime} ～ {endTime}
            </span>
          ) : null}
        </div>
        <datalist id="fzl-time-options">
          {TIME_CANDIDATES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {crossesMidnight ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            结束时间比开始时间早，会记为到{" "}
            <span className="text-[var(--gold-soft)]">
              {formatShortDate(addDays(date, 1))} {endTime}
            </span>
            。
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "英雄意向 1", value: champ1, set: setChamp1 },
          { label: "英雄意向 2", value: champ2, set: setChamp2 },
          { label: "英雄意向 3", value: champ3, set: setChamp3 },
        ].map((f, i) => (
          <ChampionCombobox
            key={f.label}
            label={f.label}
            value={f.value}
            onChange={f.set}
            placeholder={i === 0 ? "输入拼音/名字搜索，比如 xindela 或辛德拉" : "可留空"}
          />
        ))}
      </div>

      <label className="mt-5 flex flex-col gap-1 text-xs text-[var(--muted)]">
        今日宣言
        <input
          type="text"
          value={declaration}
          onChange={(e) => setDeclaration(e.target.value)}
          maxLength={140}
          placeholder="说点什么，比如「今晚必须上分」"
          className={champInputClass}
        />
      </label>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "loading" || !member || !position}
          className="font-display rounded-sm bg-[var(--gold)] px-6 py-2.5 text-sm font-bold text-[#0a0f1e] transition hover:bg-[var(--gold-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "提交中…" : "预约"}
        </button>
        {status === "done" ? (
          <span className="text-sm text-[var(--status-good)]">预约成功</span>
        ) : null}
        {status === "error" ? (
          <span className="text-sm text-[var(--status-critical)]">{error}</span>
        ) : null}
      </div>
    </form>
  );
}
