import Link from "next/link";

const links = [
  { href: "/", label: "首页" },
  { href: "/roster", label: "选手名单" },
  { href: "/fund", label: "峡谷基金" },
  { href: "/matches", label: "战绩" },
  { href: "/schedule", label: "赛程" },
];

const comingSoon = ["视频"];

export default function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[#0a0f1e]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-2 w-2 rotate-45 bg-[var(--gold)]" />
          <span className="font-display text-xl font-bold tracking-wide">
            FZL <span className="text-[var(--gold)]">GAMING</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
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
              className="hidden cursor-default items-center gap-1 text-[var(--muted)] sm:inline-flex"
              title="敬请期待"
            >
              {label}
              <span className="rounded-sm border border-[var(--border)] px-1 text-[10px] tracking-wide text-[var(--gold)]">
                SOON
              </span>
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
