"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { POSITIONS, POSITION_LABEL } from "@/lib/positions";
import { formatMinutes, parseTimeString, roundToStep } from "@/lib/time";

type ExistingSignup = {
  position: string;
  champions: string[];
  declaration: string;
  startMinute: number | null;
  endMinute: number | null;
};

type Member = {
  id: string;
  nickname: string;
  photo: string;
};

export default function ScheduleSignupForm({
  date,
  members,
  championOptions,
  existingByMember,
}: {
  date: string;
  members: Member[];
  championOptions: string[];
  existingByMember: Record<string, ExistingSignup>;
}) {
  const router = useRouter();
  const [member, setMember] = useState("");
  const [position, setPosition] = useState("");
  const [champ1, setChamp1] = useState("");
  const [champ2, setChamp2] = useState("");
  const [champ3, setChamp3] = useState("");
  const [declaration, setDeclaration] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  function handleMemberSelect(next: string) {
    setMember(next);
    const existing = existingByMember[next];
    setPosition(existing?.position ?? "");
    setChamp1(existing?.champions[0] ?? "");
    setChamp2(existing?.champions[1] ?? "");
    setChamp3(existing?.champions[2] ?? "");
    setDeclaration(existing?.declaration ?? "");
    setStartTime(existing?.startMinute != null ? formatMinutes(existing.startMinute) : "");
    setEndTime(existing?.endMinute != null ? formatMinutes(existing.endMinute) : "");
    setStatus("idle");
  }

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
          member,
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

      <div className="mt-4">
        <p className="mb-2 text-xs text-[var(--muted)]">你是谁</p>
        <div className="grid grid-cols-4 gap-3">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleMemberSelect(m.nickname)}
              className="flex flex-col items-center gap-1 justify-self-center"
            >
              <span
                className={`relative block h-12 w-12 overflow-hidden rounded-full border-2 transition ${
                  member === m.nickname
                    ? "border-[var(--gold)]"
                    : "border-[var(--border)] opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={m.photo} alt={m.nickname} fill className="object-cover" sizes="48px" />
              </span>
              <span
                className={`line-clamp-1 text-center text-[10px] ${
                  member === m.nickname ? "text-[var(--gold)]" : "text-[var(--muted)]"
                }`}
              >
                {m.nickname}
              </span>
            </button>
          ))}
        </div>
      </div>

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
        <p className="mb-2 text-xs text-[var(--muted)]">预约时间段（5 分钟为单位，可留空）</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="time"
            step={300}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onBlur={(e) => snapTime(e.target.value, setStartTime)}
            className={champInputClass + " w-32"}
          />
          <span className="text-sm text-[var(--muted)]">至</span>
          <input
            type="time"
            step={300}
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
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "英雄意向 1", value: champ1, set: setChamp1 },
          { label: "英雄意向 2", value: champ2, set: setChamp2 },
          { label: "英雄意向 3", value: champ3, set: setChamp3 },
        ].map((f, i) => (
          <label key={f.label} className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {f.label}
            <input
              type="text"
              list="fzl-champion-options"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder={i === 0 ? "输入拼音/名字搜索" : "可留空"}
              className={champInputClass}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
      <datalist id="fzl-champion-options">
        {championOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

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
