"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CodeBlock, DifficultyChip, ErrorNote, ProgressBar, Rich, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isWorking, type Difficulty, type InterviewSession, type Question, type QuestionDetail, type Repo } from "@/lib/types";

const FILTERS: (Difficulty | "all")[] = ["all", "easy", "medium", "hard"];

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
  if (!repo) return <Spinner className="text-muted" />;

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← Repos</Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-xl font-semibold">{repo.full_name}</h1>
          {repo.description && <p className="mt-1 text-sm text-ink-2">{repo.description}</p>}
          <p className="mt-2 text-xs text-muted">
            {repo.file_count} files · {repo.chunk_count} code chunks · {repo.question_count} questions
            {" · "}
            <a className="hover:text-ink" href={`https://github.com/${repo.full_name}`} target="_blank" rel="noreferrer">GitHub ↗</a>
          </p>
        </div>
        {repo.status === "ready" && (
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-sm text-ink-2" htmlFor="count">Questions</label>
            <select id="count" className="input w-auto py-1.5" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 5, 10].map((n) => <option key={n}>{n}</option>)}
            </select>
            <button onClick={start} disabled={starting} className="btn-primary">
              {starting && <Spinner />} Start mock interview
            </button>
          </div>
        )}
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {isWorking(repo.status) && (
        <div className="card mt-8 p-6">
          <p className="mb-3 text-sm font-medium">Preparing your questions…</p>
          <ProgressBar value={repo.progress} label={repo.status_detail ?? undefined} />
        </div>
      )}
      {repo.status === "failed" && <div className="mt-8"><ErrorNote>{repo.error}</ErrorNote></div>}

      {repo.status === "ready" && (
        <>
          <div className="mt-8 flex items-center gap-1" role="tablist" aria-label="Filter by difficulty">
            {FILTERS.map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-sm capitalize ${filter === f ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
                {f}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Practice mode: open a question to see its code and a model answer. In a mock interview, answers stay hidden until you reply.</p>
          <div className="mt-4 space-y-8">
            {groups.map(([path, qs]) => (
              <section key={path}>
                <h2 className="mb-2 font-mono text-xs text-muted">{path || "Architecture · whole repo"}</h2>
                <div className="space-y-2">{qs.map((q) => <QuestionRow key={q.id} q={q} />)}</div>
              </section>
            ))}
          </div>
        </>
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
    <div className="card">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span aria-hidden className={`mt-0.5 text-muted transition ${open ? "rotate-90" : ""}`}>›</span>
        <span className="flex-1">
          <span className="block text-sm leading-relaxed"><Rich text={q.text} /></span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <DifficultyChip d={q.difficulty} />
            <span className="chip">{q.topic}</span>
            {q.path && (
              <span className="font-mono text-xs text-muted">{q.symbol ?? "block"} · L{q.start_line}-{q.end_line}</span>
            )}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line p-4">
          {!detail && <Spinner className="text-muted" />}
          {detail?.chunk && <CodeBlock chunk={detail.chunk} />}
          {detail && (showAnswer ? (
            <div className="rounded-lg bg-accent-soft/40 p-3 text-sm leading-relaxed">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent-ink">What a strong answer covers</p>
              <Rich text={detail.reference_answer} />
            </div>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="btn-ghost text-xs">Reveal model answer</button>
          ))}
        </div>
      )}
    </div>
  );
}
