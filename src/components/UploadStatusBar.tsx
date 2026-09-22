"use client";

import { useUpload } from "@/components/UploadProvider";

// Sits in the root layout so an upload stays visible (and alive) after the
// uploader wanders off to another page.
export default function UploadStatusBar() {
  const { job, error, done, interrupted, dismiss } = useUpload();

  if (!job && !error && !done) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[#0a0f1e]/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        {job ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="text-[var(--foreground)]">
                <span className="text-[var(--gold-soft)]">{job.title}</span>
                &nbsp;· {job.phase}
              </span>
              <span className="text-[var(--muted)]">{Math.round(job.ratio * 100)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-sm bg-white/10">
              <div
                className="h-full bg-[var(--gold)] transition-all"
                style={{ width: `${Math.round(job.ratio * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {job.needsForeground ? (
                <>
                  压缩中，
                  <span className="text-[var(--gold-soft)]">这一步得让这个标签页留在前面</span>
                  （站内换页面没关系，别切到别的标签页或者最小化）。
                </>
              ) : (
                <>正在上传，这一步可以切走了，后台会传完。</>
              )}
            </p>
          </>
        ) : null}

        {error ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--status-critical)]">{error}</p>
            <button type="button" onClick={dismiss} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              知道了
            </button>
          </div>
        ) : null}

        {done ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--status-good)]">{done}</p>
              {interrupted ? (
                <p className="mt-1 text-xs text-[var(--status-warning)]">
                  压缩过程中这个标签页被切走过，画面可能少了一截 —— 打开看一眼，
                  不对就删掉重传。
                </p>
              ) : null}
            </div>
            <button type="button" onClick={dismiss} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              知道了
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
