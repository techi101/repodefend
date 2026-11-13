"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CodeBlock, DifficultyChip, EmptyState, ErrorNote, Icon, Loading, ProgressBar, Rich, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isWorking, type Difficulty, type InterviewSession, type Question, type QuestionDetail, type Repo } from "@/lib/types";

const FILTERS: (Difficulty | "all")[] = ["all", "easy", "medium", "hard"];

/* The ingest pipeline as the backend runs it, so the waiting screen reads like a build log. */
const PIPELINE: { label: string; from: Repo["status"][] }[] = [
  { label: "queued", from: ["queued"] },
  { label: "list files and fetch source", from: ["fetching"] },
  { label: "chunk, rank and write questions", from: ["generating"] },
];

export default function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState<Difficulty | "all">("all");
  const [count, setCount] = useState(5);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Repo>(`/repos/${id}`)
        .then(async (r) => {
          if (r.status === "ready") setQuestions(await api<Question[]>(`/repos/${id}/questions`));
          setRepo(r);
        })
        .catch((e) => setError(errorText(e))),
    [id],
  );

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!repo || !isWorking(repo.status)) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [repo, load]);

  // Group by file; repo-wide architecture questions first.
  const groups = useMemo(() => {
    const shown = questions.filter((q) => filter === "all" || q.difficulty === filter);
    const map = new Map<string, Question[]>();
    for (const q of shown) {
      const key = q.path ?? "";
      map.set(key, [...(map.get(key) ?? []), q]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [questions, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: questions.length, easy: 0, medium: 0, hard: 0 };
    for (const q of questions) c[q.difficulty]++;
    return c;
  }, [questions]);

  async function start() {
    setStarting(true);
    try {
      const s = await api<InterviewSession>("/sessions", { method: "POST", json: { repo_id: Number(id), count } });
      router.push(`/interview/${s.id}`);
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  if (error && !repo) return <ErrorNote>{error}</ErrorNote>;
  if (!repo) return <Loading label="Loading repo" />;

  const stepIdx = PIPELINE.findIndex((p) => p.from.includes(repo.status));

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <Icon name="back" className="h-3.5 w-3.5" /> Repos
      </Link>

      <div className="mt-3 flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Step 2 · Generate questions</p>
          <h1 className="flex min-w-0 items-center gap-2 font-mono text-xl font-semibold">
            <Icon name="repo" className="h-5 w-5 text-muted" />
            <span className="truncate">{repo.full_name}</span>
          </h1>
          {repo.description && <p className="mt-1.5 text-sm text-ink-2">{repo.description}</p>}
          <dl className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
            {[["files", repo.file_count], ["code chunks", repo.chunk_count], ["questions", repo.question_count]].map(([l, v]) => (
              <div key={l} className="flex items-baseline gap-1.5">
                <dt className="text-muted">{l}</dt>
                <dd className="order-first font-mono font-medium text-ink tabular-nums">{v}</dd>
              </div>
            ))}
            <a className="inline-flex items-center gap-1 text-muted hover:text-ink" href={`https://github.com/${repo.full_name}`} target="_blank" rel="noreferrer">
              GitHub <Icon name="external" className="h-3 w-3" />
            </a>
          </dl>
        </div>

        {repo.status === "ready" && (
          <div className="rounded-lg border border-line bg-surface p-3 sm:p-4">
            <p className="text-xs text-ink-2">Step 3 · Mock interview, easy to hard, timed</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-line-strong" role="radiogroup" aria-label="Number of questions">
                {[3, 5, 10].map((n) => (
                  <button key={n} role="radio" aria-checked={count === n} onClick={() => setCount(n)}
                    className={`px-3 py-1.5 font-mono text-xs ${count === n ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"} ${n !== 3 ? "border-l border-line-strong" : ""}`}>
                    {n} Qs
                  </button>
                ))}
              </div>
              <button onClick={start} disabled={starting} className="btn-primary">
                {starting ? <Spinner /> : <Icon name="play" />} Start mock interview
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {isWorking(repo.status) && (
        <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-line bg-code">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 font-mono text-xs text-muted">
            <Icon name="terminal" className="h-3.5 w-3.5" /> ingest · {repo.full_name}
            <span className="ml-auto tabular-nums text-ink-2">{repo.progress}%</span>
          </div>
          <ol className="space-y-1.5 p-4 font-mono text-[12.5px]" aria-live="polite">
            {PIPELINE.map((p, i) => (
              <li key={p.label} className={`flex gap-2 ${i < stepIdx ? "text-ink-2" : i === stepIdx ? "text-ink" : "text-muted/60"}`}>
                <span aria-hidden className={`w-3 ${i < stepIdx ? "text-good" : i === stepIdx ? "text-accent-ink" : ""}`}>{i < stepIdx ? "✓" : i === stepIdx ? "→" : "·"}</span>
                {p.label}
                {i === stepIdx && <Spinner className="ml-1 h-3 w-3 text-accent" />}
              </li>
            ))}
            {repo.status_detail && <li className="pl-5 text-muted">{repo.status_detail}</li>}
          </ol>
          <div className="px-4 pb-4"><ProgressBar value={repo.progress} /></div>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">You can leave this page; the job keeps running and the dashboard will show it as Ready.</p>
        </div>
      )}
      {repo.status === "failed" && (
        <div className="mt-8 max-w-2xl space-y-3">
          <ErrorNote>{repo.error}</ErrorNote>
          <Link href="/dashboard" className="btn-ghost"><Icon name="back" /> Back to repos to retry</Link>
        </div>
      )}

      {repo.status === "ready" && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* file tree: which files the questions cite */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <p className="eyebrow mb-2">Files cited</p>
              <ul className="space-y-px font-mono text-xs">
                {groups.map(([path, qs]) => (
                  <li key={path}>
                    <a href={`#f-${encodeURIComponent(path || "repo")}`} className="flex items-center gap-1.5 rounded px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">
                      <Icon name={path ? "file" : "folder"} className="h-3 w-3 text-muted" />
                      <span className="truncate">{path || "whole repo"}</span>
                      <span className="ml-auto tabular-nums text-muted">{qs.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-md border border-line p-0.5" role="tablist" aria-label="Filter by difficulty">
                {FILTERS.map((f) => (
                  <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                    className={`rounded px-2.5 py-1 text-xs capitalize ${filter === f ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}>
                    {f} <span className="font-mono tabular-nums text-muted">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">Practice mode: open a question to see its code and model answer.</p>
            </div>

            {groups.length === 0 && (
              <div className="mt-6">
                <EmptyState icon="file" title={questions.length ? `No ${filter} questions` : "No questions were written"}>
                  {questions.length ? <>Pick <span className="font-medium text-ink">all</span> above to see every question.</> : "This repo produced no questions. Remove it on the Repos page and try a repo with more source code."}
                </EmptyState>
              </div>
            )}

            <div className="mt-6 space-y-8">
              {groups.map(([path, qs]) => (
                <section key={path} id={`f-${encodeURIComponent(path || "repo")}`} className="scroll-mt-28">
                  <h2 className="mb-2 flex items-center gap-1.5 font-mono text-xs text-ink-2">
                    <Icon name={path ? "file" : "folder"} className="h-3.5 w-3.5 text-muted" />
                    {path || "Architecture · whole repo"}
                    <span className="text-muted">· {qs.length} question{qs.length === 1 ? "" : "s"}</span>
                  </h2>
                  <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                    {qs.map((q) => <QuestionRow key={q.id} q={q} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  async function toggle() {
    setOpen((o) => !o);
    if (!detail) setDetail(await api<QuestionDetail>(`/questions/${q.id}`));
  }

  return (
    <div className={open ? "bg-surface-2/40" : ""}>
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-2/50">
        <Icon name="chevron" className={`mt-0.5 h-4 w-4 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-relaxed text-ink"><Rich text={q.text} /></span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <DifficultyChip d={q.difficulty} />
            <span className="chip">{q.topic}</span>
            {q.path && (
              <span className="font-mono text-[11px] text-muted">{q.symbol ?? "block"} <span className="text-accent-ink">L{q.start_line}-{q.end_line}</span></span>
            )}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4 sm:pl-11">
          {!detail && <Loading label="Loading code" />}
          {detail?.chunk && <CodeBlock chunk={detail.chunk} />}
          {detail && (showAnswer ? (
            <div className="rounded-md border border-good/30 bg-good-bg p-3 text-sm leading-relaxed">
              <p className="mb-1 font-mono text-[11px] text-good-ink">+ what a strong answer covers</p>
              <Rich text={detail.reference_answer} />
            </div>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="btn-ghost px-3 py-1.5 text-xs">Reveal model answer</button>
          ))}
        </div>
      )}
    </div>
  );
}
