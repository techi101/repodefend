"use client";

import { useEffect, useReducer, useState, useSyncExternalStore } from "react";

import { CodeLines, Icon, type CodeLine } from "@/components/ui";

/* A replay of one RepoDefend run on a real public repo.
   The file tree and the code (app.py lines 72-103) are copied from
   github.com/techi101/cv-object-detector. The chunk and question totals are the
   README's measured run (26 Sep 2026). The answer and its grade are an
   illustration, and the UI says so. */

const REPO = "techi101/cv-object-detector";

type Node = { path: string; depth: number; dir?: boolean; skip?: string };
const TREE: Node[] = [
  { path: "README.md", depth: 0 },
  { path: "app.py", depth: 0 },
  { path: "detector.py", depth: 0 },
  { path: "benchmark.py", depth: 0 },
  { path: "eval_map.py", depth: 0 },
  { path: "Dockerfile", depth: 0, skip: "not source" },
  { path: "static", depth: 0, dir: true },
  { path: "script.js", depth: 1 },
  { path: "browser_detector.js", depth: 1 },
  { path: "models", depth: 1, dir: true },
  { path: "yolov8n.onnx", depth: 2, skip: "12.9 MB weights" },
  { path: "tests", depth: 0, dir: true },
  { path: "test_api.py", depth: 1 },
  { path: "test_detector.py", depth: 1 },
];

const LOG: { k: "cmd" | "step" | "skip" | "ok"; t: string; d?: string }[] = [
  { k: "cmd", t: `repodefend ingest ${REPO}` },
  { k: "step", t: "list files", d: "one API call, pinned to a commit SHA" },
  { k: "skip", t: "static/models/yolov8n.onnx", d: "12.9 MB, weights" },
  { k: "skip", t: "Dockerfile, .gitignore", d: "not source" },
  { k: "step", t: "fetch source only", d: "8 files at a time" },
  { k: "step", t: "split into functions and classes", d: "python via ast" },
  { k: "step", t: "rank chunks", d: "how far an interviewer can dig" },
  { k: "step", t: "write questions", d: "design · failure cases · trade-offs" },
  { k: "ok", t: "58 chunks → 22 questions", d: "measured run" },
];

const CODE: CodeLine[] = [
  { n: 72, text: '@app.post("/detect")' },
  { n: 73, text: "def detect_objects(file: UploadFile = File(...)):" },
  { n: null, text: "", fold: "lines 74-99: docstring, validation, decode" },
  { n: 100, text: "        frame = resize_image(frame)" },
  { n: 101, text: "" },
  { n: 102, text: "        detections = detector.detect_frame(frame)" },
  { n: 103, text: "        annotated_frame = detector.draw_detections(frame, detections)" },
];
const PINNED = new Set([73, 102]);

const QUESTION = "Why is this route handler a plain def instead of async def, and how does FastAPI run it without blocking the event loop?";
const ANSWER = "I made it sync because... I think it's faster?";

const RUBRIC: { ok: boolean; t: string }[] = [
  { ok: true, t: "Knows the handler is sync on purpose" },
  { ok: false, t: "FastAPI runs plain def routes in a thread pool" },
  { ok: false, t: "YOLO inference is CPU-bound; inside async def it would block the event loop" },
];

const STAGES = [
  { label: "Scan repo", ms: 5600 },
  { label: "Question", ms: 6000 },
  { label: "Answer", ms: 4600 },
  { label: "Grade", ms: 7000 },
] as const;
const TICK = 100;

type S = { stage: number; elapsed: number };
type A = { type: "tick" } | { type: "go"; stage: number };
function reducer(s: S, a: A): S {
  if (a.type === "go") return { stage: a.stage, elapsed: 0 };
  const e = s.elapsed + TICK;
  return e >= STAGES[s.stage].ms ? { stage: (s.stage + 1) % STAGES.length, elapsed: 0 } : { ...s, elapsed: e };
}

const RM = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia(RM).matches, () => false);

export default function HeroDemo() {
  const reduced = useReducedMotion();
  const [{ stage, elapsed }, dispatch] = useReducer(reducer, { stage: 0, elapsed: 0 });
  const [hover, setHover] = useState(false);
  const [stopped, setStopped] = useState(false);
  const running = !reduced && !hover && !stopped;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => dispatch({ type: "tick" }), TICK);
    return () => clearInterval(t);
  }, [running]);

  // With motion off, every stage shows its finished state.
  const full = reduced || stopped;
  const logShown = full ? LOG.length : Math.min(LOG.length, Math.floor(elapsed / 480) + 1);
  const typed = full ? ANSWER.length : Math.max(0, Math.min(ANSWER.length, Math.floor((elapsed - 500) / 45)));
  const scanned = stage === 0 && !full ? Math.floor((elapsed / STAGES[0].ms) * TREE.length * 1.15) : TREE.length;

  return (
    <figure className="min-w-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
        {/* title bar */}
        <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-3 py-2">
          <Icon name="repo" className="h-3.5 w-3.5 text-muted" />
          <span className="min-w-0 truncate font-mono text-xs text-ink-2">{REPO}</span>
          <span className="ml-auto shrink-0 rounded border border-line px-1.5 py-px font-mono text-[10px] text-muted">example run</span>
          {!reduced && (
            <button onClick={() => setStopped((s) => !s)} className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted hover:bg-surface-3 hover:text-ink"
                    aria-label={stopped ? "Play the demo" : "Pause the demo"}>
              {stopped ? "play" : "pause"}
            </button>
          )}
        </div>

        {/* numbered step tabs */}
        <div role="tablist" aria-label="Demo steps" className="grid grid-cols-4 border-b border-line">
          {STAGES.map((s, i) => (
            <button key={s.label} role="tab" aria-selected={i === stage} onClick={() => dispatch({ type: "go", stage: i })}
              className={`relative px-2 py-2 text-left font-mono text-[11px] transition-colors sm:px-3 ${i === stage ? "bg-surface text-ink" : "bg-surface-2/40 text-muted hover:text-ink-2"} ${i > 0 ? "border-l border-line" : ""}`}>
              <span className={i === stage ? "text-accent-ink" : ""}>{String(i + 1).padStart(2, "0")}</span>
              <span className="ml-1.5 hidden sm:inline">{s.label}</span>
              {i === stage && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/30">
                  <span className="block h-full bg-accent" style={{ width: full ? "100%" : `${(elapsed / s.ms) * 100}%`, transition: `width ${TICK}ms linear` }} />
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid h-[360px] grid-cols-1 sm:grid-cols-[170px_1fr]">
          {/* file tree */}
          <ul className="hidden overflow-hidden border-r border-line bg-surface-2/40 py-2 font-mono text-[11.5px] sm:block" aria-label="Repository files">
            {TREE.map((n, i) => {
              const active = stage > 0 && n.path === "app.py";
              const read = i < scanned;
              return (
                <li key={n.path} style={{ paddingLeft: 10 + n.depth * 12 }}
                    className={`flex items-center gap-1.5 py-[3px] pr-2 ${active ? "bg-accent-soft/70 text-ink shadow-[inset_2px_0_0_var(--accent)]" : n.skip ? "text-muted/60" : read ? "text-ink-2" : "text-muted/60"}`}>
                  <Icon name={n.dir ? "folder" : "file"} className="h-3 w-3 opacity-70" />
                  <span className={`truncate ${n.skip && read ? "line-through" : ""}`}>{n.path}</span>
                  {!n.dir && read && !n.skip && stage === 0 && <Icon name="check" className="ml-auto h-3 w-3 text-good" />}
                </li>
              );
            })}
          </ul>

          <div className="relative min-w-0 overflow-hidden">
            {stage === 0 && (
              <ol className="space-y-1.5 p-4 font-mono text-[12px] leading-5" aria-live="polite">
                {LOG.slice(0, logShown).map((l, i) => (
                  <li key={i} className="anim-in flex min-w-0 gap-2">
                    <span aria-hidden className={`w-3 shrink-0 ${l.k === "ok" ? "text-good" : l.k === "skip" ? "text-muted" : l.k === "cmd" ? "text-accent-ink" : "text-ink-2"}`}>
                      {l.k === "cmd" ? "$" : l.k === "ok" ? "✓" : l.k === "skip" ? "–" : "→"}
                    </span>
                    <span className={`min-w-0 ${l.k === "skip" ? "text-muted line-through decoration-muted/50" : l.k === "ok" ? "font-medium text-good-ink" : "text-ink"}`}>
                      {l.t}
                      {l.d && <span className="ml-2 text-muted no-underline">{l.d}</span>}
                    </span>
                  </li>
                ))}
                {logShown < LOG.length && <li aria-hidden className="caret ml-5 h-4 w-2 bg-ink-2" />}
              </ol>
            )}

            {stage === 1 && (
              <div className="anim-in flex h-full flex-col">
                <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 font-mono text-[11px] text-muted">
                  <Icon name="file" className="h-3 w-3" /> <span className="text-ink-2">app.py</span>
                  <span className="text-accent-ink">:72-103</span> <span>· detect_objects</span>
                </div>
                <div className="bg-code">
                  <CodeLines lines={CODE} lang="python" pinned={PINNED} className="!py-1.5 text-[11.5px]" />
                </div>
                <div className="relative m-3 mt-auto rounded-md border border-line-strong bg-surface-2 p-3">
                  <span aria-hidden className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border-l border-t border-line-strong bg-surface-2" />
                  <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
                    <span className="rounded bg-accent-soft px-1.5 py-px text-accent-ink">interviewer</span> cites app.py:73, 102
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-snug text-ink">{QUESTION}</p>
                </div>
              </div>
            )}

            {stage === 2 && (
              <div className="anim-in space-y-3 p-4 text-[13.5px]">
                <div>
                  <p className="font-mono text-[11px] text-accent-ink">interviewer</p>
                  <p className="mt-1 leading-snug text-ink-2">{QUESTION}</p>
                </div>
                <div className="rounded-md border border-line-strong bg-code p-3">
                  <p className="font-mono text-[11px] text-muted">you</p>
                  <p className="mt-1 min-h-10 text-ink">
                    {ANSWER.slice(0, typed)}
                    {typed < ANSWER.length && <span aria-hidden className="caret ml-px inline-block h-4 w-[2px] translate-y-0.5 bg-accent" />}
                  </p>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] text-muted">
                  <span><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to submit</span>
                  <span className={`rounded px-2 py-1 ${typed >= ANSWER.length ? "bg-accent text-on-accent" : "bg-surface-3"}`}>Submit answer</span>
                </div>
              </div>
            )}

            {stage === 3 && (
              <div className="anim-in space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md border border-critical/40 bg-critical-bg px-3 py-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Example score</p>
                    <p className="font-mono text-2xl font-semibold text-ink">4<span className="text-sm text-muted">/10</span></p>
                  </div>
                  <p className="text-sm text-critical-ink"><Icon name="x" className="mr-1 inline h-3.5 w-3.5" />Weak. Right instinct, no reason given.</p>
                </div>
                <div className="overflow-hidden rounded-md border border-line font-mono text-[12px] leading-5">
                  <p className="border-b border-line bg-surface-2 px-3 py-1 text-[11px] text-muted">rubric · checked against app.py:72-125</p>
                  {RUBRIC.map((r, i) => (
                    <p key={r.t} style={{ animationDelay: full ? undefined : `${i * 250}ms` }}
                       className={`anim-in flex gap-2 px-3 py-1 ${r.ok ? "bg-good-bg text-good-ink" : "bg-critical-bg text-critical-ink"}`}>
                      <span aria-hidden className="w-2 shrink-0">{r.ok ? "+" : "-"}</span>
                      <span><span className="sr-only">{r.ok ? "Covered: " : "Missed: "}</span>{r.t}</span>
                    </p>
                  ))}
                </div>
                <p className="text-[12.5px] text-ink-2">The model answer stays hidden until you reply, then shows what a strong answer covers.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-2.5 font-mono text-[11px] leading-relaxed text-muted">
        Replay of a run on {REPO}. The files and code are real; the answer and its grade are an illustration.
      </figcaption>
    </figure>
  );
}
