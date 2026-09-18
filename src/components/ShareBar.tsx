type Segment = {
  label: string;
  value: number; // 0-1 fraction
  color: string; // css var, e.g. "var(--series-1)"
};

export default function ShareBar({ segments }: { segments: Segment[] }) {
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-sm border border-[var(--border)]">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-sm last:rounded-r-sm"
            style={{
              width: `${s.value * 100}%`,
              backgroundColor: s.color,
              marginLeft: i === 0 ? 0 : "2px",
            }}
            title={`${s.label} ${(s.value * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[var(--foreground)]/90">{s.label}</span>
            <span className="text-[var(--muted)]">
              {(s.value * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
