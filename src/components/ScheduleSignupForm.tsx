"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { POSITIONS, POSITION_LABEL } from "@/lib/positions";

type ExistingSignup = {
  position: string;
  champions: string[];
  declaration: string;
};

export default function ScheduleSignupForm({
  date,
  members,
  championOptions,
  existingByMember,
}: {
  date: string;
  members: string[];
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
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  function handleMemberChange(next: string) {
    setMember(next);
    const existing = existingByMember[next];
    setPosition(existing?.position ?? "");
    setChamp1(existing?.champions[0] ?? "");
    setChamp2(existing?.champions[1] ?? "");
    setChamp3(existing?.champions[2] ?? "");
    setDeclaration(existing?.declaration ?? "");
    setStatus("idle");
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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5"
    >
      <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
        预约今晚
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          你是谁
          <select
            value={member}
            onChange={(e) => handleMemberChange(e.target.value)}
            className="rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]"
          >
            <option value="" className="bg-[var(--bg-panel)]">
              选择你的昵称
            </option>
            {members.map((m) => (
              <option key={m} value={m} className="bg-[var(--bg-panel)]">
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          预约位置
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]"
          >
            <option value="" className="bg-[var(--bg-panel)]">
              选择位置
            </option>
            {POSITIONS.map((p) => (
              <option key={p} value={p} className="bg-[var(--bg-panel)]">
                {POSITION_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        {[
          { label: "英雄意向 1", value: champ1, set: setChamp1 },
          { label: "英雄意向 2", value: champ2, set: setChamp2 },
          { label: "英雄意向 3", value: champ3, set: setChamp3 },
        ].map((f) => (
          <label key={f.label} className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {f.label}
            <select
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]"
            >
              <option value="" className="bg-[var(--bg-panel)]">
                不限
              </option>
              {championOptions.map((c) => (
                <option key={c} value={c} className="bg-[var(--bg-panel)]">
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)] sm:col-span-2">
          今日宣言
          <input
            type="text"
            value={declaration}
            onChange={(e) => setDeclaration(e.target.value)}
            maxLength={140}
            placeholder="说点什么，比如「今晚必须上分」"
            className="rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "loading" || !member || !position}
          className="font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50"
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
