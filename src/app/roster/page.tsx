import Image from "next/image";
import { roster, TEAM_NAME } from "@/lib/roster";

export const metadata = {
  title: "选手名单 · FZL Gaming",
};

export default function RosterPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-12 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gold)]">
          Official Roster
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">
          {TEAM_NAME}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {roster.map((p) => (
          <div
            key={p.id}
            className="group relative rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-2.5"
          >
            <span className="absolute right-3 top-3 z-10 rounded-sm bg-[var(--gold)] px-2 py-0.5 font-display text-xs font-bold text-[#0a0f1e]">
              NO.{String(p.number).padStart(2, "0")}
            </span>

            <div className="relative aspect-[4/5] overflow-hidden rounded-sm">
              <Image
                src={p.photo}
                alt={p.nickname}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow: "inset 0 -60px 50px -20px rgba(10,15,30,0.85)",
                }}
              />
            </div>

            <div className="px-1 pb-1 pt-3">
              <div className="mb-2 h-[2px] w-8 -skew-x-12 bg-[var(--gold)]" />
              <h3 className="mb-2 truncate text-lg font-black">
                {p.nickname}
              </h3>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {p.positions.map((pos) => (
                  <span
                    key={pos}
                    className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--gold-soft)]"
                  >
                    {pos}
                  </span>
                ))}
              </div>

              <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Pool
              </p>
              <p className="text-sm text-[var(--foreground)]/90">
                {p.champions.join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
