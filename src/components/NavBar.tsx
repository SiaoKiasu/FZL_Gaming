"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/", label: "首页" },
  { href: "/roster", label: "选手名单" },
  { href: "/fund", label: "峡谷基金" },
  { href: "/matches", label: "战绩" },
  { href: "/schedule", label: "赛程" },
];

const comingSoon = ["视频"];

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[#0a0f1e]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
          <span className="h-2 w-2 rotate-45 bg-[var(--gold)]" />
          <span className="font-display text-lg font-bold tracking-wide sm:text-xl">
            FZL <span className="text-[var(--gold)]">GAMING</span>
          </span>
        </Link>

        {/* Desktop nav -- collapses to the hamburger below md, since 5
            Chinese labels plus the logo don't fit a phone-width row. */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-medium text-[var(--foreground)]/90 transition hover:text-[var(--gold)]"
            >
              {l.label}
            </Link>
          ))}
          {comingSoon.map((label) => (
            <span
              key={label}
              className="inline-flex cursor-default items-center gap-1 text-[var(--muted)]"
              title="敬请期待"
            >
              {label}
              <span className="rounded-sm border border-[var(--border)] px-1 text-[10px] tracking-wide text-[var(--gold)]">
                SOON
              </span>
            </span>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "关闭菜单" : "打开菜单"}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border)] text-[var(--foreground)] transition hover:border-[var(--gold)]/60 hover:text-[var(--gold)] md:hidden"
        >
          <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open ? (
        <nav className="border-t border-[var(--border)] bg-[#0a0f1e] px-4 py-2 md:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-2 py-3 text-sm font-medium text-[var(--foreground)]/90 transition hover:bg-white/5 hover:text-[var(--gold)]"
              >
                {l.label}
              </Link>
            ))}
            {comingSoon.map((label) => (
              <span
                key={label}
                className="flex items-center gap-2 px-2 py-3 text-sm text-[var(--muted)]"
                title="敬请期待"
              >
                {label}
                <span className="rounded-sm border border-[var(--border)] px-1 text-[10px] tracking-wide text-[var(--gold)]">
                  SOON
                </span>
              </span>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
