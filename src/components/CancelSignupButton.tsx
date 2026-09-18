"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelSignupButton({ date, member }: { date: string; member: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const resp = await fetch("/api/schedule/signup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, member }),
      });
      if (resp.ok) {
        router.refresh();
        return;
      }
    } catch {
      // fall through to reset below
    }
    setBusy(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs">
        <span className="text-[var(--muted)]">取消这条预约？</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="rounded-full border border-[var(--status-critical)]/60 px-2 py-0.5 font-semibold text-[var(--status-critical)] transition hover:bg-[var(--status-critical)]/10 disabled:opacity-50"
        >
          {busy ? "…" : "确定"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-50"
        >
          再想想
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="取消预约"
      title="取消预约"
      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--status-critical)]/10 hover:text-[var(--status-critical)]"
    >
      ×
    </button>
  );
}
