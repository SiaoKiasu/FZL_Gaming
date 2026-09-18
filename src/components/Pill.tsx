import type { ReactNode } from "react";

const styles = {
  good: "text-[var(--status-good)] border-[var(--status-good)]/40 bg-[var(--status-good)]/10",
  warning:
    "text-[var(--status-warning)] border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10",
  critical:
    "text-[var(--status-critical)] border-[var(--status-critical)]/40 bg-[var(--status-critical)]/10",
  neutral: "text-[var(--muted)] border-[var(--border)] bg-transparent",
};

export default function Pill({
  tone,
  children,
}: {
  tone: keyof typeof styles;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
