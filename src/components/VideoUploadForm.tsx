"use client";

import { useRef, useState } from "react";
import { useUpload } from "@/components/UploadProvider";

const inputClass =
  "rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const buttonClass =
  "font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50";

// Collects the metadata and hands the file to UploadProvider, which owns the
// actual work. Keeping the run out of this component is what lets an upload
// survive navigating away from /videos.
export default function VideoUploadForm() {
  const { job, start } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [champion, setChampion] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const busy = job !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("先选个视频文件");
    if (!title.trim()) return setError("给视频起个标题");

    setError("");
    await start(file, {
      title: title.trim(),
      champion: champion.trim(),
      description: description.trim(),
    });

    setTitle("");
    setChampion("");
    setDescription("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题，比如「亚索一打五」"
          maxLength={60}
          className={inputClass}
          disabled={busy}
        />

        <input
          type="text"
          value={champion}
          onChange={(e) => setChampion(e.target.value)}
          placeholder="英雄（可不填）"
          maxLength={20}
          className={inputClass}
          disabled={busy}
        />
      </div>

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="说两句（可不填）"
        maxLength={200}
        className={inputClass}
        disabled={busy}
      />

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        disabled={busy}
        className="text-sm text-[var(--muted)] file:mr-3 file:rounded-sm file:border file:border-[var(--border)] file:bg-transparent file:px-3 file:py-2 file:text-sm file:text-[var(--foreground)]"
      />

      <p className="text-xs text-[var(--muted)]">
        直接传录屏原文件就行，网页会自动压到 1080p / 2Mbps 并去掉声音
        （20 秒左右的片段大概 5MB）。压缩这一步需要把视频完整播一遍，
        <span className="text-[var(--gold-soft)]">期间可以在站内随便翻页，但别切到别的标签页</span>
        ；压完之后的上传阶段就随便了。
      </p>

      {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}

      <button type="submit" disabled={busy} className={`${buttonClass} self-start`}>
        {busy ? "处理中……" : "上传"}
      </button>
    </form>
  );
}
