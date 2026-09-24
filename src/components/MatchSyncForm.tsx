"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  scannedGames: number;
  newGames: number;
  repairedGames: number;
  totalGames: number;
  refreshedGames: number;
  timeline?: { fetched: number; failed: number; pending: number };
  perPlayer: { name: string; scanned: number; found: number }[];
};

type BackfillProgress = { done: number; failed: number; pending: number; rounds: number };

export default function MatchSyncForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [refreshAll, setRefreshAll] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");
  const [backfill, setBackfill] = useState<BackfillProgress | null>(null);
  const [backfilling, setBackfilling] = useState(false);

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
      // Keep the token only if there's a timeline backlog to work through --
      // the backfill button below needs it. Otherwise drop it right away.
      if (!(data.timeline?.pending > 0)) setToken("");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
      setStatus("error");
    }
  }

  // Calls the backfill route until it reports nothing pending. Each call is
  // bounded to ~45s server-side, so a backlog of any size is just more
  // rounds; the loop stops on the first error (a dead token, typically).
  async function handleBackfill() {
    if (!token.trim() || backfilling) return;
    setBackfilling(true);
    setError("");
    const acc: BackfillProgress = { done: 0, failed: 0, pending: 0, rounds: 0 };
    try {
      for (;;) {
        const resp = await fetch("/api/matches/timeline-backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setError(data.error ?? "补全失败");
          break;
        }
        acc.done += data.done;
        acc.failed += data.failed;
        acc.pending = data.pending;
        acc.rounds += 1;
        setBackfill({ ...acc });
        // No progress in a round means the remaining games keep failing;
        // don't spin on them.
        if (data.pending === 0 || data.done === 0) break;
      }
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBackfilling(false);
      if (acc.pending === 0) setToken("");
    }
  }

  const pendingTimeline = backfill?.pending ?? result?.timeline?.pending ?? 0;

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
          disabled={status === "loading" || backfilling || !token.trim()}
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
        同时刷新已同步过的旧对局（较慢；评分规则或详情页字段更新后想给旧对局补数据时勾上）
      </label>

      {status === "error" ? (
        <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
      ) : null}

      {status === "done" && result ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-[var(--status-good)]">
            新增 {result.newGames} 场车队对局（累计 {result.totalGames} 场）
            {result.refreshedGames > 0 ? ` · 已刷新 ${result.refreshedGames} 场旧对局` : ""}
            {result.repairedGames > 0 ? ` · 自动补全了 ${result.repairedGames} 场之前数据不完整的旧对局` : ""}
            {result.timeline ? ` · 本次拉到 ${result.timeline.fetched} 场对局的 timeline` : ""}
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

      {pendingTimeline > 0 || backfill ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border)]/40 pt-3 text-xs">
          <span className="text-[var(--muted)]">
            {pendingTimeline > 0
              ? `还有 ${pendingTimeline} 场排位没有 timeline（团战 / 开团 / 游走这些维度暂时按其余维度计分）`
              : "timeline 已全部补齐"}
            {backfill ? ` · 已补 ${backfill.done} 场${backfill.failed ? `，失败 ${backfill.failed} 场` : ""}，${backfill.rounds} 轮` : ""}
          </span>
          {pendingTimeline > 0 ? (
            <button
              type="button"
              onClick={handleBackfill}
              disabled={backfilling || !token.trim()}
              title={token.trim() ? "用上面的 token 逐批补全，自动续跑到结束" : "先粘贴 token"}
              className="font-display rounded-sm border border-[var(--gold)]/60 px-3 py-1 text-xs font-semibold text-[var(--gold)] transition hover:bg-[var(--gold)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {backfilling ? "补全中…" : "补全 timeline"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
