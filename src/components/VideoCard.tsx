"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoItem } from "@/lib/videos";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDuration(sec: number | null): string {
  if (!sec || !Number.isFinite(sec)) return "";
  return `${Math.round(sec)}s`;
}

export default function VideoCard({
  video,
  member,
}: {
  video: VideoItem;
  /** The logged-in member, or null. Comes from the session, never a picker. */
  member: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isMine = member !== null && video.member === member;

  const myScore = member ? video.scoresByMember[member] : undefined;

  // Start pulling the file while the card is still below the fold. These
  // clips are only a few MB, so by the time someone has finished rating
  // the video above this one, this one is usually already buffered -- which
  // is what makes a Hong Kong-hosted file feel instant on a mainland
  // connection rather than showing a spinner on every click.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  async function rate(score: number) {
    if (!member) {
      setError("先登录才能打分");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/videos/${video.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "打分失败");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打分失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
      if (!resp.ok) {
        const data = await resp.json();
        setError(data.error ?? "删除失败");
        setBusy(false);
        setConfirmingDelete(false);
        return;
      }
      // The card disappears with the refresh, so no need to reset state.
      router.refresh();
    } catch {
      setError("删除失败，检查一下网络");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!member) {
      setError("先登录才能评论");
      return;
    }
    if (!comment.trim()) return;
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/videos/${video.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "评论失败");
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{video.title}</h3>
        {isMine ? (
          confirmingDelete ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
              <span className="text-[var(--muted)]">连同评分评论一起删掉？</span>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-full border border-[var(--status-critical)]/60 px-2 py-0.5 font-semibold text-[var(--status-critical)] transition hover:bg-[var(--status-critical)]/10 disabled:opacity-50"
              >
                {busy ? "…" : "确定"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-50"
              >
                再想想
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] transition hover:border-[var(--status-critical)]/60 hover:text-[var(--status-critical)]"
            >
              删除
            </button>
          )
        ) : null}
        <p className="w-full text-xs text-[var(--muted)]">
          {video.member}
          {video.champion ? ` · ${video.champion}` : ""}
          {" · "}
          {formatDate(video.createdAt)}
          {video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ""}
        </p>
      </header>

      {video.src ? (
        <video
          ref={videoRef}
          src={near ? video.src : undefined}
          poster={video.poster ?? undefined}
          controls
          playsInline
          preload={near ? "auto" : "none"}
          className="w-full rounded-sm bg-black"
        />
      ) : (
        <p className="rounded-sm border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          视频存储还没配好，播放不了
        </p>
      )}

      {video.description ? (
        <p className="text-sm text-[var(--foreground)]/80">{video.description}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold text-[var(--gold)]">
            {video.avgScore === null ? "—" : video.avgScore.toFixed(1)}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {video.voteCount > 0 ? `${video.voteCount} 人打分` : "还没人打分"}
            {myScore ? ` · 你给了 ${myScore} 分` : ""}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {SCORES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || !member}
              onClick={() => rate(s)}
              className={`h-8 w-8 rounded-sm border text-xs transition disabled:opacity-50 ${
                myScore === s
                  ? "border-[var(--gold)] bg-[var(--gold)] font-bold text-[#0a0f1e]"
                  : "border-[var(--border)] text-[var(--foreground)]/80 hover:border-[var(--gold)]/60 hover:text-[var(--gold)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {video.comments.length ? (
        <ul className="flex flex-col gap-1 border-t border-[var(--border)] pt-3">
          {video.comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="text-[var(--gold-soft)]">{c.member}</span>
              <span className="text-[var(--foreground)]/85">：{c.body}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={submitComment} className="flex gap-2">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={member ? "说两句……" : "登录后可评论"}
          maxLength={300}
          disabled={busy || !member}
          className="flex-1 rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        <button
          type="submit"
          disabled={busy || !member || !comment.trim()}
          className="font-display rounded-sm border border-[var(--border)] px-4 text-sm transition hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-40"
        >
          发送
        </button>
      </form>

      {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}
    </article>
  );
}
