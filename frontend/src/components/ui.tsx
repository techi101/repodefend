"use client";

import Link from "next/link";
import { Fragment } from "react";

import type { Chunk, Difficulty } from "@/lib/types";

/* ------------------------------------------------------------------ icons */
/* Inline 16px stroke icons, so there is no icon dependency. */
const ICONS = {
  github: "M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z",
  arrow: "M3 8h10M9 4l4 4-4 4",
  back: "M13 8H3M7 4 3 8l4 4",
  check: "m3.5 8.5 3 3 6-7",
  x: "m4 4 8 8M12 4l-8 8",
  alert: "M8 5v4M8 11.5v.01M7.1 2.5 1.6 12a1 1 0 0 0 .9 1.5h11a1 1 0 0 0 .9-1.5L8.9 2.5a1 1 0 0 0-1.8 0Z",
  file: "M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8L9 1.5ZM9 1.5V5.5h4",
  folder: "M1.5 4a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4Z",
  chevron: "m6 4 4 4-4 4",
  terminal: "m3 5 3 3-3 3M8 11h5",
  play: "M5 3.5v9l7-4.5-7-4.5Z",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9",
  external: "M6 3H3v10h10v-3M9 2h5v5M14 2 7.5 8.5",
  plus: "M8 3v10M3 8h10",
  chart: "M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5",
  repo: "M3.5 13V3a1 1 0 0 1 1-1h8v9.5h-8a1 1 0 0 0-1 1Zm0 0a1 1 0 0 0 1 1h8M6 5h3",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  if (name === "github")
    return <svg aria-hidden viewBox="0 0 16 16" className={`${className} shrink-0 fill-current`}><path d={ICONS.github} /></svg>;
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`${className} shrink-0`} fill="none" stroke="currentColor"
         strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
  );
}

/* ----------------------------------------------------------------- scores */
type Level = { icon: IconName; word: string; text: string; bg: string; border: string };
export function scoreLevel(score: number): Level {
  if (score >= 7) return { icon: "check", word: "Strong", text: "text-good-ink", bg: "bg-good-bg", border: "border-good/40" };
  if (score >= 5) return { icon: "alert", word: "Partial", text: "text-warning-ink", bg: "bg-warning-bg", border: "border-warning/40" };
  return { icon: "x", word: "Weak", text: "text-critical-ink", bg: "bg-critical-bg", border: "border-critical/40" };
}

/** A score always shows an icon and a word next to its colour, never colour alone. */
export function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  if (score === null) return <span className="chip">not answered</span>;
  const l = scoreLevel(score);
  if (size === "lg")
    return (
      <div className={`inline-flex items-center gap-4 rounded-lg border px-4 py-2.5 ${l.border} ${l.bg}`}>
        <div>
          <p className="eyebrow">Score</p>
          <p className="font-mono text-3xl font-semibold tabular-nums text-ink">
            {score}<span className="text-base text-muted">/10</span>
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 text-sm font-medium ${l.text}`}>
          <Icon name={l.icon} /> {l.word}
        </span>
      </div>
    );
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${l.border} ${l.bg} ${l.text}`}>
      <Icon name={l.icon} className="h-3 w-3" /> {score}/10 · {l.word}
    </span>
  );
}

const DIFF: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function DifficultyChip({ d }: { d: Difficulty }) {
  return (
    <span className="chip" title={`${d} question`}>
      <span aria-hidden className="flex gap-px">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-2 w-1 rounded-[1px] ${n <= DIFF[d] ? "bg-accent" : "bg-line-strong"}`} />
        ))}
      </span>
      {d}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar"
           aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${value}%` }} />
      </div>
      {label && <p className="mt-1.5 truncate font-mono text-xs text-muted">{label}</p>}
    </div>
  );
}

/** file:line citation, the product's signature detail. */
export function Location({ path, symbol, start, end }: { path: string | null; symbol: string | null; start: number | null; end: number | null }) {
  if (!path) return <span className="font-mono text-xs text-muted">whole repo · architecture</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted">
      <Icon name="file" className="h-3 w-3" />
      <span className="truncate">
        <span className="text-ink-2">{path}</span>
        {start !== null && <span className="text-accent-ink">:{start}-{end}</span>}
        {symbol && <span> · {symbol}</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ highlighting */
const KW: Record<string, Set<string>> = {
  py: new Set("def class return if elif else for while try except finally raise with as import from in not and or is None True False lambda yield async await pass break continue global self".split(" ")),
  js: new Set("const let var function return if else for while try catch finally throw new class extends import from export default async await of in typeof null undefined true false this switch case break continue".split(" ")),
};
const langKey = (lang: string) => (/^py/i.test(lang) ? "py" : "js");

type Tok = { t: string; c?: string };

/** A tiny line tokenizer: good enough for comments, strings, keywords, numbers and calls. */
function tokenize(line: string, lang: string, inDoc: boolean): { toks: Tok[]; inDoc: boolean } {
  const toks: Tok[] = [];
  const py = langKey(lang) === "py";
  const kw = KW[langKey(lang)];
  let i = 0;
  if (inDoc) {
    const end = line.indexOf('"""');
    if (end === -1) return { toks: [{ t: line, c: "tok-str" }], inDoc: true };
    toks.push({ t: line.slice(0, end + 3), c: "tok-str" });
    i = end + 3;
  }
  const re = /(#.*$|\/\/.*$)|("""|'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(@[\w.]+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g;
  re.lastIndex = i;
  let last = i;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) toks.push({ t: line.slice(last, m.index) });
    const [s] = m;
    if (m[1] && (py ? s.startsWith("#") : s.startsWith("//"))) toks.push({ t: s, c: "tok-com" });
    else if (m[1]) toks.push({ t: s });
    else if (m[2] && (s === '"""' || s === "'''")) {
      const close = line.indexOf(s, m.index + 3);
      if (close === -1) {
        toks.push({ t: line.slice(m.index), c: "tok-str" });
        return { toks, inDoc: py && s === '"""' };
      }
      toks.push({ t: line.slice(m.index, close + 3), c: "tok-str" });
      re.lastIndex = close + 3;
    } else if (m[2]) toks.push({ t: s, c: "tok-str" });
    else if (m[3] && py) toks.push({ t: s, c: "tok-dec" });
    else if (m[4]) toks.push({ t: s, c: "tok-num" });
    else if (m[5]) toks.push({ t: s, c: kw.has(s) ? "tok-kw" : "tok-fn" });
    else if (m[6]) toks.push({ t: s, c: kw.has(s) ? "tok-kw" : undefined });
    else toks.push({ t: s });
    last = re.lastIndex;
  }
  if (last < line.length) toks.push({ t: line.slice(last) });
  return { toks, inDoc: false };
}

export function highlightLines(lines: string[], lang: string): Tok[][] {
  let inDoc = false;
  return lines.map((l) => {
    const r = tokenize(l, lang, inDoc);
    inDoc = r.inDoc;
    return r.toks;
  });
}

export type CodeLine = { n: number | null; text: string; fold?: string };

/** Line-numbered, highlighted code. `pinned` lines get the accent gutter (the cited lines). */
export function CodeLines({ lines, lang, pinned, className = "" }: { lines: CodeLine[]; lang: string; pinned?: Set<number>; className?: string }) {
  const toks = highlightLines(lines.map((l) => (l.fold ? "" : l.text)), lang);
  return (
    <pre className={`overflow-auto py-2 font-mono text-[12.5px] leading-5 ${className}`}>
      {lines.map((l, i) =>
        l.fold ? (
          <div key={i} className="my-0.5 flex bg-surface-2/60 text-muted">
            <span className="w-12 shrink-0 select-none pr-3 text-right">⋯</span>
            <span className="pr-4 italic">{l.fold}</span>
          </div>
        ) : (
          <div key={i} className={`flex ${l.n !== null && pinned?.has(l.n) ? "bg-accent-soft/60 shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
            <span className="w-12 shrink-0 select-none pr-3 text-right text-muted/70">{l.n}</span>
            <code className="whitespace-pre pr-4 text-ink">
              {toks[i].length ? toks[i].map((t, j) => <span key={j} className={t.c}>{t.t}</span>) : " "}
            </code>
          </div>
        ),
      )}
    </pre>
  );
}

export function CodeBlock({ chunk, maxHeight = "28rem" }: { chunk: Chunk; maxHeight?: string }) {
  const lines = chunk.content.split("\n").map((text, i) => ({ n: chunk.start_line + i, text }));
  return (
    <div className="overflow-hidden rounded-md border border-line bg-code">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 font-mono text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name="file" className="h-3 w-3" />
          <span className="truncate text-ink-2">{chunk.path}</span>
          <span className="shrink-0 text-accent-ink">:{chunk.start_line}-{chunk.end_line}</span>
        </span>
        <span className="shrink-0">{chunk.language}</span>
      </div>
      <div style={{ maxHeight }} className="overflow-auto">
        <CodeLines lines={lines} lang={chunk.language} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- layout */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical-ink">
      <Icon name="alert" className="mt-0.5 h-4 w-4" /> <span>{children}</span>
    </p>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted" role="status">
      <Spinner className="h-3 w-3" /> {label}…
    </p>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-[5px] border border-accent/50 bg-accent-soft font-mono text-[11px] font-bold text-accent-ink">
        {"{?}"}
      </span>
      <span className={compact ? "hidden sm:inline" : ""}>RepoDefend</span>
    </span>
  );
}

/** Empty state: says what this is and exactly what to click. */
export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <span className="mx-auto grid h-9 w-9 place-items-center rounded-md border border-line bg-surface-2 text-ink-2">
        <Icon name={icon} />
      </span>
      <p className="mt-3 font-medium">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm text-ink-2">{children}</div>
    </div>
  );
}

/** The four-step path through the product, shown on every signed-in page. */
export const FLOW = ["Connect repo", "Generate questions", "Interview", "Review"] as const;

export function FlowSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex min-w-0 items-center gap-1 overflow-x-auto font-mono text-[11px] text-muted" aria-label="Steps">
      {FLOW.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        const href = n === 1 ? "/dashboard" : n === 4 ? "/progress" : null;
        const inner = (
          <>
            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border text-[10px] ${
              state === "now" ? "border-accent bg-accent text-on-accent" : state === "done" ? "border-line-strong text-ink-2" : "border-line text-muted"}`}>
              {n}
            </span>
            <span className={`whitespace-nowrap ${state === "now" ? "text-ink" : ""} ${state === "now" ? "" : "hidden md:inline"}`}>{s}</span>
          </>
        );
        return (
          <Fragment key={s}>
            {i > 0 && <li aria-hidden className="h-px w-3 shrink-0 bg-line-strong sm:w-5" />}
            <li aria-current={state === "now" ? "step" : undefined} className="shrink-0">
              {href && state !== "now" ? (
                <Link href={href} className="flex items-center gap-1.5 hover:text-ink">{inner}</Link>
              ) : (
                <span className="flex items-center gap-1.5">{inner}</span>
              )}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Page title row. One primary action goes in `action`. */
export function PageHeader({ eyebrow, title, children, action }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <div className="mt-1.5 text-sm text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* Language colours: muted, GitHub-like, used only for the language bar. */
const LANG_COLOUR: Record<string, string> = {
  python: "#3572A5", javascript: "#e3cf4f", typescript: "#3178c6", go: "#00ADD8", java: "#b07219", rust: "#dea584",
  html: "#e34c26", css: "#7a5fb0", c: "#7a8691", cpp: "#f34b7d", ruby: "#cc342d", php: "#4F5D95", kotlin: "#A97BFF", swift: "#F05138",
};

/** Share of files per language, as one stacked bar plus a labelled legend. */
export function LangBar({ languages }: { languages: Record<string, number> }) {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  const colour = (l: string) => LANG_COLOUR[l.toLowerCase()] ?? "#6b7480";
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {entries.map(([l, n]) => <span key={l} style={{ width: `${(n / total) * 100}%`, background: colour(l) }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
        {entries.map(([l, n]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colour(l) }} />
            <span className="text-ink-2">{l}</span> {n} file{n === 1 ? "" : "s"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Model text uses `backticks` for code; render those as inline code, everything else as plain text. */
export function Rich({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded border border-line bg-surface-2 px-1 py-px font-mono text-[0.86em] text-accent-ink">{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  );
}
