import Link from "next/link";
import Image from "next/image";
import { roster, TEAM_NAME } from "@/lib/roster";

const roadmap = [
  {
    title: "实时在线状态",
    status: "规划中",
    desc: "接入外部后端，展示车队成员的实时在线与游戏中状态。",
  },
  {
    title: "对局数据统计",
    status: "规划中",
    desc: "同步排位战绩，沉淀个人与战队维度的数据面板。",
  },
  {
    title: "视频 / 集锦上传",
    status: "规划中",
    desc: "支持车队成员上传比赛录像与集锦，集中展示与回顾。",
  },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden px-6 pb-20 pt-24">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "linear-gradient(180deg, rgba(231,182,85,0.06), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
            Official Team Portal
          </p>
          <h1 className="font-display mt-4 text-6xl font-extrabold tracking-tight sm:text-7xl">
            {TEAM_NAME}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-[var(--muted)]">
            车队专属门户 —— 选手名单、数据与更多内容将陆续在这里上线。
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/roster"
              className="rounded-sm bg-[var(--gold)] px-6 py-3 text-sm font-semibold text-[#0a0f1e] transition hover:bg-[var(--gold-soft)]"
            >
              查看选手名单
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">选手一览</h2>
          <Link
            href="/roster"
            className="text-sm text-[var(--gold)] hover:text-[var(--gold-soft)]"
          >
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {roster.map((p) => (
            <Link
              href="/roster"
              key={p.id}
              className="group flex flex-col items-center gap-2"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--bg-panel)]">
                <Image
                  src={p.photo}
                  alt={p.nickname}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-105"
                  sizes="200px"
                />
              </div>
              <span className="line-clamp-1 text-center text-xs text-[var(--muted)] group-hover:text-[var(--gold)]">
                {p.nickname}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-display mb-6 text-2xl font-bold">功能规划</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {roadmap.map((r) => (
            <div
              key={r.title}
              className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{r.title}</h3>
                <span className="rounded-sm border border-[var(--border)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--gold)]">
                  {r.status}
                </span>
              </div>
              <p className="text-sm text-[var(--muted)]">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
