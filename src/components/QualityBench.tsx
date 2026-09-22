"use client";

import { useRef, useState } from "react";
import { prepareVideo } from "@/lib/transcode";

// A bench for choosing the encoder settings by eye instead of by guesswork.
// Runs the exact same prepareVideo() the upload form uses, so whatever looks
// acceptable here is what members will get. Nothing is uploaded: everything
// stays in this tab as object URLs, so no COS keys and no database are
// needed to use it.

type Run = {
  id: number;
  label: string;
  url: string;
  sizeBytes: number;
  width: number;
  height: number;
  bitrate: number;
  seconds: number;
};

const HEIGHT_CHOICES = [720, 1080, 1440];
const inputClass =
  "rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function mbps(bitsPerSecond: number): string {
  return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
}

export default function QualityBench() {
  const fileRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<HTMLVideoElement>(null);

  const [original, setOriginal] = useState<Run | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [shown, setShown] = useState<Run | null>(null);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [bitrateMbps, setBitrateMbps] = useState(2.0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState("");

  function onPick() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    // Probe the source once so the comparison has something to sit next to.
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const seconds = Number.isFinite(probe.duration) ? probe.duration : 0;
      setOriginal({
        id: 0,
        label: "原片",
        url,
        sizeBytes: file.size,
        width: probe.videoWidth,
        height: probe.videoHeight,
        bitrate: seconds > 0 ? Math.round((file.size * 8) / seconds) : 0,
        seconds,
      });
      setRuns([]);
      setShown(null);
      setError("");
    };
    probe.onerror = () => setError("这个视频浏览器读不了，换个 mp4 试试");
  }

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("先选个视频");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await prepareVideo(
        file,
        (p, r) => {
          setPhase(p);
          setRatio(r);
        },
        {
          maxHeight,
          bitrate: Math.round(bitrateMbps * 1_000_000),
          // Without this, an already-small mp4 would be passed through and
          // there would be nothing to compare.
          force: true,
        }
      );
      const entry: Run = {
        id: Date.now(),
        label: `${maxHeight}p / ${bitrateMbps} Mbps`,
        url: URL.createObjectURL(result.blob),
        sizeBytes: result.blob.size,
        width: result.width,
        height: result.height,
        bitrate: result.bitrate,
        seconds: result.durationSec,
      };
      setRuns((prev) => [entry, ...prev]);
      setShown(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "压缩失败");
    } finally {
      setBusy(false);
      setPhase("");
      setRatio(0);
    }
  }

  // Seeking both to the same timestamp is what makes a still-frame
  // comparison meaningful -- side-by-side playback drifts out of sync
  // within a second or two.
  function syncPlay() {
    const a = originalRef.current;
    const b = resultRef.current;
    if (!a || !b) return;
    b.currentTime = a.currentTime;
    void a.play();
    void b.play();
  }

  function syncPause() {
    originalRef.current?.pause();
    resultRef.current?.pause();
  }

  function alignToOriginal() {
    const a = originalRef.current;
    const b = resultRef.current;
    if (a && b) b.currentTime = a.currentTime;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-4">
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          onChange={onPick}
          disabled={busy}
          className="text-sm text-[var(--muted)] file:mr-3 file:rounded-sm file:border file:border-[var(--border)] file:bg-transparent file:px-3 file:py-2 file:text-sm file:text-[var(--foreground)]"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            分辨率上限
            <select
              value={maxHeight}
              onChange={(e) => setMaxHeight(Number(e.target.value))}
              disabled={busy}
              className={inputClass}
            >
              {HEIGHT_CHOICES.map((h) => (
                <option key={h} value={h}>
                  {h}p
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            码率
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.2}
              value={bitrateMbps}
              onChange={(e) => setBitrateMbps(Number(e.target.value))}
              disabled={busy}
              className={`${inputClass} w-24`}
            />
            Mbps
          </label>

          <button
            type="button"
            onClick={run}
            disabled={busy || !original}
            className="font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "压缩中……" : "压一次看看"}
          </button>
        </div>

        {busy ? (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--muted)]">
              <span>{phase}（压缩要把视频完整播一遍，别切走页面）</span>
              <span>{Math.round(ratio * 100)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-sm bg-white/10">
              <div
                className="h-full bg-[var(--gold)] transition-all"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}
      </section>

      {original ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={syncPlay} className="rounded-sm border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--gold)] hover:text-[var(--gold)]">
              两边一起播
            </button>
            <button type="button" onClick={syncPause} className="rounded-sm border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--gold)] hover:text-[var(--gold)]">
              一起暂停
            </button>
            <button type="button" onClick={alignToOriginal} className="rounded-sm border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--gold)] hover:text-[var(--gold)]">
              把右边对齐到左边这一帧
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <figure className="flex flex-col gap-2">
              <figcaption className="text-sm text-[var(--muted)]">
                原片 · {original.width}×{original.height} · {mb(original.sizeBytes)} ·{" "}
                {mbps(original.bitrate)}
              </figcaption>
              <video ref={originalRef} src={original.url} controls playsInline className="w-full rounded-sm bg-black" />
            </figure>

            <figure className="flex flex-col gap-2">
              <figcaption className="text-sm text-[var(--gold-soft)]">
                {shown
                  ? `压缩后 · ${shown.width}×${shown.height} · ${mb(shown.sizeBytes)} · ${mbps(shown.bitrate)}`
                  : "压缩后 · 还没压过"}
              </figcaption>
              {shown ? (
                <video ref={resultRef} src={shown.url} controls playsInline className="w-full rounded-sm bg-black" />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-sm border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                  点上面的「压一次看看」
                </div>
              )}
            </figure>
          </div>
        </section>
      ) : null}

      {runs.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold">试过的几组</h2>
          <p className="text-xs text-[var(--muted)]">
            点一行就切到右边播放器对比。同一段素材可以反复压，参数改了再压一次就行。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2">参数</th>
                  <th className="py-2">分辨率</th>
                  <th className="py-2">大小</th>
                  <th className="py-2">码率</th>
                  <th className="py-2">相对原片</th>
                  <th className="py-2">每 10 秒约</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setShown(r)}
                    className={`cursor-pointer border-t border-[var(--border)] transition hover:bg-white/5 ${
                      shown?.id === r.id ? "text-[var(--gold)]" : ""
                    }`}
                  >
                    <td className="py-2">{r.label}</td>
                    <td className="py-2">
                      {r.width}×{r.height}
                    </td>
                    <td className="py-2">{mb(r.sizeBytes)}</td>
                    <td className="py-2">{mbps(r.bitrate)}</td>
                    <td className="py-2">
                      {original && original.sizeBytes > 0
                        ? `${((r.sizeBytes / original.sizeBytes) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2">
                      {r.seconds > 0
                        ? `${((r.sizeBytes / r.seconds / 1024 / 1024) * 10).toFixed(1)} MB`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <a
                        href={r.url}
                        download={`fzl-${r.width}x${r.height}-${Math.round(
                          r.bitrate / 1000
                        )}k.webm`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[var(--gold-soft)] underline"
                      >
                        下载
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
