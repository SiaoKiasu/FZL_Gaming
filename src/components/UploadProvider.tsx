"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareVideo } from "@/lib/transcode";

// Keeps an in-flight upload alive across client-side navigation. The form
// lives on /videos, but this provider sits in the root layout, so walking
// off to /matches mid-encode no longer unmounts the work.
//
// What this CANNOT do is survive the tab going to the background. The
// encoder here is canvas.captureStream() fed by a playing <video>, and
// browsers stop producing frames from a canvas in a hidden tab on purpose
// (crbug 639105, Firefox bug 1344524); requestVideoFrameCallback is
// rendering-driven too, and a setInterval pump gets clamped to ~1Hz. There
// is no flag that opts out. So instead of silently producing a truncated
// clip, this tracks whether the tab was ever hidden mid-encode and says so.

export type UploadMeta = {
  title: string;
  champion: string;
  description: string;
};

type Job = {
  title: string;
  phase: string;
  ratio: number;
  /** True while encoding, i.e. while the tab genuinely must stay visible. */
  needsForeground: boolean;
};

type UploadContextValue = {
  job: Job | null;
  error: string;
  done: string;
  /** Set when the tab was hidden during encoding -- the output may be short. */
  interrupted: boolean;
  start: (file: File, meta: UploadMeta) => Promise<void>;
  dismiss: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload 必须在 UploadProvider 里使用");
  return ctx;
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// XHR rather than fetch, purely for upload.onprogress -- fetch still can't
// report how much of a request body has gone out.
function putToCos(url: string, blob: Blob, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`上传失败（COS 返回 ${xhr.status}）`));
    };
    xhr.onerror = () =>
      reject(new Error("上传失败，检查一下网络，或者 COS 的跨域(CORS)规则配了没"));
    xhr.send(blob);
  });
}

export default function UploadProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [interrupted, setInterrupted] = useState(false);

  // Refs, not state: these are read inside callbacks and event handlers that
  // must not re-run when they change.
  const encodingRef = useRef(false);
  const hiddenDuringEncodeRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Warn before a reload or tab close swallows an upload in progress.
  useEffect(() => {
    if (!job) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [job]);

  // A screen wake lock keeps a phone from dimming mid-encode, which would
  // stall it for exactly the reason described at the top of this file. The
  // lock is dropped by the browser whenever the page hides, so it's
  // re-acquired on the way back.
  useEffect(() => {
    if (!job?.needsForeground) return;

    let cancelled = false;
    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // Denied, unsupported, or the page wasn't visible. Not fatal.
      }
    };
    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Record it rather than react to it: nothing can be done at this
        // point, but the uploader deserves to be told the result may be short.
        if (encodingRef.current) hiddenDuringEncodeRef.current = true;
      } else {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const held = wakeLockRef.current;
      wakeLockRef.current = null;
      if (held) void held.release().catch(() => {});
    };
  }, [job?.needsForeground]);

  const dismiss = useCallback(() => {
    setError("");
    setDone("");
    setInterrupted(false);
  }, []);

  const start = useCallback(
    async (file: File, meta: UploadMeta) => {
      setError("");
      setDone("");
      setInterrupted(false);
      hiddenDuringEncodeRef.current = false;
      encodingRef.current = true;
      setJob({ title: meta.title, phase: "读取视频", ratio: 0, needsForeground: true });

      try {
        // 1. Encode in the browser. This is the stretch that needs the tab
        //    visible; everything after it does not.
        const prepared = await prepareVideo(file, (phase, ratio) => {
          setJob((j) => (j ? { ...j, phase, ratio } : j));
        });
        encodingRef.current = false;

        if (hiddenDuringEncodeRef.current && !prepared.skipped) {
          setInterrupted(true);
        }

        // 2. From here on the work is plain network I/O, which browsers do
        //    NOT throttle in a hidden tab -- so the foreground requirement
        //    is genuinely lifted for the rest of the run.
        setJob((j) => (j ? { ...j, phase: "准备上传", ratio: 0, needsForeground: false } : j));
        const signResp = await fetch("/api/videos/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ext: prepared.ext }),
        });
        const signed = await signResp.json();
        if (!signResp.ok) throw new Error(signed.error ?? "拿不到上传地址");

        setJob((j) => (j ? { ...j, phase: "上传中", ratio: 0 } : j));
        await putToCos(signed.videoUrl, prepared.blob, (ratio) =>
          setJob((j) => (j ? { ...j, ratio } : j))
        );

        let posterKey: string | null = null;
        if (prepared.poster) {
          try {
            await putToCos(signed.posterUrl, prepared.poster, () => {});
            posterKey = signed.posterKey;
          } catch {
            // A missing poster is cosmetic -- never fail the upload over it.
            posterKey = null;
          }
        }

        setJob((j) => (j ? { ...j, phase: "保存中", ratio: 1 } : j));
        const saveResp = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectKey: signed.videoKey,
            posterKey,
            title: meta.title,
            champion: meta.champion,
            description: meta.description,
            durationSec: prepared.durationSec,
            sizeBytes: prepared.blob.size,
            width: prepared.width,
            height: prepared.height,
          }),
        });
        const saved = await saveResp.json();
        if (!saveResp.ok) throw new Error(saved.error ?? "保存失败");

        setDone(
          prepared.skipped
            ? `「${meta.title}」传好了（${formatMB(prepared.blob.size)}，原文件码率本来就不高，没再压）`
            : `「${meta.title}」传好了（${formatMB(file.size)} → ${formatMB(prepared.blob.size)}）`
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        encodingRef.current = false;
        setJob(null);
      }
    },
    [router]
  );

  return (
    <UploadContext.Provider value={{ job, error, done, interrupted, start, dismiss }}>
      {children}
    </UploadContext.Provider>
  );
}
