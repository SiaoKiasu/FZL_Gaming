"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  scannedGames: number;
  newGames: number;
  repairedGames: number;
  totalGames: number;
  refreshedGames: number;
  perPlayer: { name: string; scanned: number; found: number }[];
};

export default function MatchSyncForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [refreshAll, setRefreshAll] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setStatus("loading");
    setError("");
    try {
      const resp = await fetch("/api/matches/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), refreshAll }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "同步失败");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("done");
      setToken(""); // never keep the token around once it's been used
      router.refresh();
    } catch {
      setError("网络错误，请重试");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
        同步战绩
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 SGP token"
          className="flex-1 rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status === "loading" || !token.trim()}
          className="font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "同步中…" : "同步"}
        </button>
      </form>

      <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={refreshAll}
          onChange={(e) => setRefreshAll(e.target.checked)}
          className="accent-[var(--gold)]"
        />
        同时刷新已同步过的旧对局（较慢；只有战绩详情页加了新字段后想给旧对局补数据时才需要勾）
      </label>

      {status === "error" ? (
        <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
      ) : null}

      {status === "done" && result ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-[var(--status-good)]">
            新增 {result.newGames} 场车队排位（累计 {result.totalGames} 场）
            {result.refreshedGames > 0 ? ` · 已刷新 ${result.refreshedGames} 场旧对局` : ""}
            {result.repairedGames > 0 ? ` · 自动补全了 ${result.repairedGames} 场之前数据不完整的旧对局` : ""}
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--muted)] sm:grid-cols-4">
            {result.perPlayer.map((p) => (
              <li key={p.name}>
                {p.name}：翻 {p.scanned} 场找到 {p.found} 场
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
