import Link from "next/link";
import { TEAM_NAME } from "@/lib/roster";

const quickLinks = [
  {
    href: "/matches",
    eyebrow: "Match History",
    title: "战绩",
    desc: "同步全队排位对局,含 MVP / SVP 评分与详细数据。",
    cta: "查看战绩 →",
  },
  {
    href: "/fund",
    eyebrow: "Team Prize Fund",
    title: "峡谷基金",
    desc: "奖金池分配规则、缴费情况、月度结算与收支流水。",
    cta: "查看详情 →",
  },
  {
    href: "/schedule",
    eyebrow: "Daily Sign-up",
    title: "赛程",
    desc: "预约今晚开黑、报位置、选英雄意向,留一句今日宣言。",
    cta: "去预约 →",
  },
  {
    href: "/videos",
    eyebrow: "Highlights",
    title: "视频 / 集锦",
    desc: "传自己的高光片段,全队一起打分评论。",
    cta: "去看看 →",
  },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
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
          <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            {TEAM_NAME}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-[var(--muted)]">
            无畏，竞巅峰。
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

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className="group flex flex-col justify-between gap-4 rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-6 transition hover:border-[var(--gold)]/60"
            >
              <div>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
                  {item.eyebrow}
                </p>
                <h2 className="font-display mt-2 text-2xl font-bold">
                  {item.title}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.desc}</p>
              </div>
              <span className="self-start rounded-sm border border-[var(--gold)]/40 px-4 py-2 text-sm font-semibold text-[var(--gold)] transition group-hover:bg-[var(--gold)] group-hover:text-[#0a0f1e]">
                {item.cta}
              </span>
            </Link>
          ))}

        </div>
      </section>
    </div>
  );
}
