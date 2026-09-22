import { notFound } from "next/navigation";
import QualityBench from "@/components/QualityBench";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "画质对比台 · FZL Gaming",
};

// A local tuning tool, not a team-facing page: it exists so the encoder
// settings in lib/transcode.ts can be picked by looking at real footage.
// Deliberately 404s outside development -- it isn't linked from anywhere,
// but an unlisted URL is not access control.
export default function QualityPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          画质 <span className="text-[var(--gold)]">对比台</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          本地调参用，线上打不开。跑的是上传表单用的同一套压缩代码，
          所以这里看着能接受的画质，就是队友实际会看到的画质。
          全程在浏览器里完成，不会上传到 COS，也不写数据库。
        </p>
      </section>

      <QualityBench />
    </div>
  );
}
