"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import championSearchData from "@/data/championSearch.json";

type ChampionEntry = {
  title: string;
  name: string;
  display: string;
  py: string;
  initials: string;
};

// Sorted once at module load, not per render -- this list never changes at
// runtime. Both the title (称号, e.g. 暗黑元首) and the real name (真名,
// e.g. 辛德拉) stay searchable and visible: `display` combines them
// ("暗黑元首 辛德拉") for the stored value and the option label, and
// `py`/`initials` are pinyin for BOTH the title and the name (space-joined)
// so someone who only remembers "Syndra" can type "xindela"/"xdl" while
// someone who only remembers the title can still type "anheiyuanshou"/"ahys".
// See champions.json's comment in sgp.ts for why match history still shows
// only the title -- that's a separate file (championTitles.json) untouched
// by any of this.
const CHAMPIONS: ChampionEntry[] = Object.values(
  championSearchData as Record<string, ChampionEntry>
).sort((a, b) => a.py.localeCompare(b.py));

function matches(entry: ChampionEntry, query: string): boolean {
  if (!query) return true;
  // A query with any Chinese character matches against the combined
  // title+name string, so typing either "暗黑元首" or "辛德拉" finds this
  // entry; anything else (Latin letters) is treated as pinyin, either full
  // spelling or just initials, for either the title or the name.
  if (/[一-鿿]/.test(query)) {
    return entry.display.includes(query);
  }
  return entry.py.includes(query) || entry.initials.includes(query);
}

const MAX_RESULTS = 8;

export default function ChampionCombobox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? CHAMPIONS.filter((c) => matches(c, q)) : CHAMPIONS;
    return list.slice(0, MAX_RESULTS);
  }, [value]);

  function pick(display: string) {
    onChange(display);
    setOpen(false);
  }

  const inputClass =
    "w-full rounded-sm border border-[var(--border)] bg-[#0a0f1e] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold)]";

  return (
    <label ref={rootRef} className="relative flex flex-col gap-1 text-xs text-[var(--muted)]">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[highlight].display);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClass}
      />
      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          {results.map((c, i) => (
            <button
              key={c.display}
              type="button"
              // Fires before the input's onBlur/onClickOutside would close
              // the panel and steal focus, so the click actually lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c.display)}
              className={`block w-full px-3 py-1.5 text-left text-sm transition ${
                i === highlight
                  ? "bg-[var(--gold)]/15 text-[var(--gold)]"
                  : "text-[var(--foreground)] hover:bg-[var(--gold)]/10"
              }`}
            >
              {c.display}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}
