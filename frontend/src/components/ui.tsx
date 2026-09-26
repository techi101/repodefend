"use client";

import type { Chunk, Difficulty } from "@/lib/types";

/** A score always shows an icon and a word next to its colour, never colour alone. */
export function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  if (score === null) return <span className="chip">not answered</span>;
  const level =
    score >= 7
      ? { icon: "✓", word: "Strong", cls: "border-good/40 text-good-ink", dot: "bg-good" }
      : score >= 5
        ? { icon: "!", word: "Partial", cls: "border-warning/50 text-warning-ink", dot: "bg-warning" }
        : { icon: "✕", word: "Weak", cls: "border-critical/40 text-critical-ink", dot: "bg-critical" };
  if (size === "lg")
    return (
      <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2 ${level.cls}`}>
        <span className="text-4xl font-semibold tabular-nums text-ink">
          {score}
          <span className="text-lg text-muted">/10</span>
        </span>
        <span className="text-sm font-medium">
          {level.icon} {level.word}
        </span>
      </div>
    );
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${level.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${level.dot}`} />
      {level.icon} {score}/10 · {level.word}
    </span>
  );
}

const DIFF: Record<Difficulty, string> = { easy: "●○○", medium: "●●○", hard: "●●●" };

export function DifficultyChip({ d }: { d: Difficulty }) {
  return (
    <span className="chip gap-1" title={`${d} question`}>
      <span aria-hidden className="tracking-tighter text-accent">{DIFF[d]}</span>
      {d}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar"
           aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${value}%` }} />
      </div>
      {label && <p className="mt-1.5 truncate text-xs text-muted">{label}</p>}
    </div>
  );
}

export function Location({ path, symbol, start, end }: { path: string | null; symbol: string | null; start: number | null; end: number | null }) {
  if (!path) return <span className="font-mono text-xs text-muted">whole repo · architecture</span>;
  return (
    <span className="font-mono text-xs text-muted">
      {path}
      {start !== null && `:${start}-${end}`}
      {symbol && <span className="text-ink-2"> · {symbol}</span>}
    </span>
  );
}

export function CodeBlock({ chunk, maxHeight = "28rem" }: { chunk: Chunk; maxHeight?: string }) {
  const lines = chunk.content.split("\n");
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-code">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-xs text-muted">
        <span className="truncate">{chunk.path}</span>
        <span className="shrink-0 pl-2">{chunk.language}</span>
      </div>
      <pre className="overflow-auto py-2 font-mono text-[12.5px] leading-5" style={{ maxHeight }}>
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-muted/70">{chunk.start_line + i}</span>
            <code className="whitespace-pre pr-4 text-ink">{line || " "}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical-ink">
      {children}
    </p>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent font-mono text-sm text-white">{"{?}"}</span>
      <span className={compact ? "hidden sm:inline" : ""}>RepoDefend</span>
    </span>
  );
}

/** Model text uses `backticks` for code; render those as inline code, everything else as plain text. */
export function Rich({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.88em]">{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  );
}
