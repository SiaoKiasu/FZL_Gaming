import Link from "next/link";
import { isCosConfigured } from "@/lib/cos";
import { isDbConfigured } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";
import { listVideosSafe } from "@/lib/videos";
import VideoCard from "@/components/VideoCard";
import VideoUploadForm from "@/components/VideoUploadForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "视频 · FZL Gaming",
};

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
      {children}
    </p>
  );
}

export default async function VideosPage() {
  // The one source of identity on this page. Everything below is either
  // read-only or disabled until this is non-null, and the API routes check
  // the session again themselves -- this only decides what to render.
  const member = await getCurrentMember();
  // listVideosSafe returns null when db/schema_video.sql hasn't been run
  // yet, which is distinct from "ran fine, nobody has uploaded" (an empty
  // array) -- the two need different hints below.
  const videos = isDbConfigured() ? await listVideosSafe() : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="mb-12">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          视频 <span className="text-[var(--gold)]">/ 集锦</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          传自己的高光片段，大家一起打分评论。视频存在腾讯云香港节点，国内直接看，不用翻墙。
        </p>
      </section>

      <section className="mb-12">
        <h2 className="font-display mb-4 text-xl font-bold">传一个</h2>
        {!isCosConfigured() ? (
          <Notice>
            视频存储还没配好 —— 需要在 Vercel 里设好 COS_SECRET_ID、COS_SECRET_KEY、
            COS_BUCKET、COS_REGION，改完记得重新部署一次。
          </Notice>
        ) : !member ? (
          <Notice>
            <Link href="/login?next=/videos" className="text-[var(--gold)] underline">
              登录
            </Link>
            &nbsp;之后就能传视频了。
          </Notice>
        ) : (
          <>
            <p className="mb-3 text-xs text-[var(--muted)]">
              以 <span className="text-[var(--gold-soft)]">{member}</span> 的身份上传
            </p>
            <VideoUploadForm />
          </>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold">全部视频</h2>
          {member ? (
            <p className="text-xs text-[var(--muted)]">
              打分 / 评论身份：
              <span className="text-[var(--gold-soft)]">{member}</span>
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              <Link href="/login?next=/videos" className="text-[var(--gold)] underline">
                登录
              </Link>
              &nbsp;后可以打分和评论
            </p>
          )}
        </div>

        {videos === null ? (
          <Notice>
            还没建好视频相关的数据表 —— 把 db/schema_video.sql 在 Vercel 的
            Postgres Query 里跑一次就好。
          </Notice>
        ) : videos.length === 0 ? (
          <Notice>还没人传过视频，来当第一个。</Notice>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} member={member} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
