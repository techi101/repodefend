"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CodeBlock, DifficultyChip, ErrorNote, Icon, Loading, Location, Rich, ScoreBadge, scoreLevel, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import type { Answer, InterviewSession } from "@/lib/types";

const firstOpen = (s: InterviewSession) => {
  const i = s.answers.findIndex((a) => a.score === null);
  return i === -1 ? s.answers.length - 1 : i;
};

export default function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InterviewSession>(`/sessions/${id}`)
      .then((s) => { setSession(s); setIndex(firstOpen(s)); setSummary(s.status === "completed"); })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  const onGraded = useCallback((s: InterviewSession) => setSession(s), []);

  async function finish() {
    if (!confirm("End the interview now? Unanswered questions won't be scored.")) return;
    setSession(await api<InterviewSession>(`/sessions/${id}/complete`, { method: "POST" }));
    setSummary(true);
  }

  if (error && !session) return <ErrorNote>{error}</ErrorNote>;
  if (!session) return <Loading label="Loading interview" />;

  const done = summary;
  const current = session.answers[index];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/repos/${session.repo_id}`} className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted hover:text-ink">
          <Icon name="back" className="h-3.5 w-3.5" /> <span className="truncate">{session.repo_full_name}</span>
        </Link>
        {session.status === "active" && (
          <button onClick={finish} className="shrink-0 whitespace-nowrap text-xs text-muted hover:text-critical-ink">End interview</button>
        )}
      </div>

      {/* One numbered step per question: coloured by score once answered, ringed when current. */}
      <ol className="mt-4 flex gap-1.5" aria-label="Questions">
        {session.answers.map((a, i) => {
          const l = a.score !== null ? scoreLevel(a.score) : null;
          const on = i === index && !done;
          return (
            <li key={a.id} className="min-w-0 flex-1">
              <button onClick={() => setIndex(i)} aria-current={on ? "step" : undefined}
                aria-label={`Question ${i + 1}${a.score !== null ? `, scored ${a.score} of 10` : ""}`}
                className="group w-full text-left">
                <span className={`block h-1 w-full rounded-full transition ${l ? (a.score! >= 7 ? "bg-good" : a.score! >= 5 ? "bg-warning" : "bg-critical") : on ? "bg-accent" : "bg-surface-3 group-hover:bg-line-strong"}`} />
                <span className={`mt-1.5 hidden font-mono text-[10px] sm:block ${on ? "text-ink" : "text-muted"}`}>
                  Q{i + 1}{a.score !== null && ` · ${a.score}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {done ? (
        <Summary session={session} onRetry={() => router.push(`/repos/${session.repo_id}`)} />
      ) : (
        <QuestionStep
          key={current.id}
          sessionId={session.id}
          answer={current}
          number={index + 1}
          total={session.total}
          onGraded={onGraded}
          onNext={() => setIndex(firstOpen(session))}
          onFinish={() => setSummary(true)}
          isLast={session.answers.every((a, i) => i === index || a.score !== null)}
        />
      )}
    </div>
  );
}

function useElapsed(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function Speaker({ who, children }: { who: "interviewer" | "you"; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className={`rounded px-1.5 py-px ${who === "interviewer" ? "bg-accent-soft text-accent-ink" : "bg-surface-3 text-ink-2"}`}>{who}</span>
      {children}
    </div>
  );
}

function QuestionStep({ sessionId, answer, number, total, onGraded, onNext, onFinish, isLast }: {
  sessionId: number; answer: Answer; number: number; total: number;
  onGraded: (s: InterviewSession) => void; onNext: () => void; onFinish: () => void; isLast: boolean;
}) {
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = answer.score !== null;
  const elapsed = useElapsed(!answered);
  const q = answer.question;

  async function submit() {
    if (!text.trim() || grading) return;
    setGrading(true);
    setError(null);
    try {
      onGraded(await api<InterviewSession>(`/sessions/${sessionId}/answers/${answer.id}`, { method: "POST", json: { text } }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setGrading(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between font-mono text-xs text-muted">
        <span>Question <span className="text-ink">{number}</span> of {total}</span>
        {!answered && (
          <span className="flex items-center gap-1.5 tabular-nums" aria-label="Time on this question">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-critical" /> {elapsed}
          </span>
        )}
      </div>

      {/* interviewer turn */}
      <div className="mt-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <Speaker who="interviewer"><Location path={q.path} symbol={q.symbol} start={q.start_line} end={q.end_line} /></Speaker>
        <h1 className="mt-3 text-lg font-medium leading-snug sm:text-xl"><Rich text={q.text} /></h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DifficultyChip d={q.difficulty} />
          <span className="chip">{q.topic}</span>
          {answer.code && (
            <button onClick={() => setShowCode((s) => !s)} className="btn-link ml-auto text-xs" aria-expanded={showCode}>
              <Icon name="file" className="h-3.5 w-3.5" /> {showCode ? "Hide the code" : "Peek at the code"}
            </button>
          )}
        </div>
        {answer.code && showCode && <div className="mt-3"><CodeBlock chunk={answer.code} maxHeight="20rem" /></div>}
      </div>

      {!answered ? (
        <div className="mt-4">
          <div className="overflow-hidden rounded-lg border border-line-strong bg-code focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            <div className="border-b border-line px-4 py-2"><Speaker who="you"><span className="text-muted">answer as you would out loud</span></Speaker></div>
            <label htmlFor="answer" className="sr-only">Your answer</label>
            <textarea id="answer" className="block min-h-44 w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-muted"
              autoFocus maxLength={4000}
              placeholder="What it does, why it's built this way, what breaks…"
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-muted">
              <span className="tabular-nums">{text.length}/4000</span>
              <span className="hidden sm:inline"> · <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to submit</span>
            </span>
            <button onClick={submit} disabled={!text.trim() || grading} className="btn-primary">
              {grading ? <><Spinner /> Grading…</> : <>Submit answer <Icon name="arrow" /></>}
            </button>
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      ) : (
        <Feedback answer={answer} onNext={isLast ? onFinish : onNext} isLast={isLast} />
      )}
    </section>
  );
}

function Feedback({ answer, onNext, isLast }: { answer: Answer; onNext: () => void; isLast: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      {/* candidate turn, collapsed */}
      <details className="group rounded-lg border border-line bg-code">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5">
          <Speaker who="you"><span className="text-muted">your answer</span></Speaker>
          <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted">
            <span className="group-open:hidden">Show more</span><span className="hidden group-open:inline">Show less</span>
            <Icon name="chevron" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          </span>
        </summary>
        <p className="whitespace-pre-wrap border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-2">{answer.text}</p>
      </details>

      {/* grade */}
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ScoreBadge score={answer.score} size="lg" />
          <button onClick={onNext} className="btn-primary">
            {isLast ? "See results" : "Next question"} <Icon name="arrow" />
          </button>
        </div>
        <div className="mt-4">
          <Speaker who="interviewer"><span className="text-muted">feedback</span></Speaker>
          <p className="mt-2 leading-relaxed text-ink"><Rich text={answer.feedback} /></p>
        </div>
      </div>

      {/* rubric as a diff: what was missing (-) and what a strong answer covers (+) */}
      <div className="overflow-hidden rounded-lg border border-line font-mono text-[12.5px] leading-relaxed">
        <p className="border-b border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">
          rubric{answer.question.path ? ` · checked against ${answer.question.path}:${answer.question.start_line}-${answer.question.end_line}` : ""}
        </p>
        {answer.missed.length > 0 && (
          <ul aria-label="You missed">
            {answer.missed.map((m) => (
              <li key={m} className="flex gap-3 bg-critical-bg px-4 py-1.5 text-critical-ink">
                <span aria-hidden className="select-none">-</span>
                <span className="font-sans text-sm"><span className="sr-only">Missed: </span><Rich text={m} /></span>
              </li>
            ))}
          </ul>
        )}
        {answer.missed.length === 0 && (
          <p className="flex gap-3 bg-good-bg px-4 py-1.5 text-good-ink"><span aria-hidden>+</span><span className="font-sans text-sm">Nothing important missed.</span></p>
        )}
        {answer.reference_answer && (
          <div className="flex gap-3 border-t border-line bg-good-bg px-4 py-2.5 text-good-ink">
            <span aria-hidden className="select-none">+</span>
            <div className="font-sans text-sm">
              <p className="font-mono text-[11px]">what a strong answer covers</p>
              <p className="mt-1 leading-relaxed text-ink"><Rich text={answer.reference_answer} /></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ session, onRetry }: { session: InterviewSession; onRetry: () => void }) {
  return (
    <section className="mt-8">
      <p className="eyebrow">Step 4 · Review</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Interview finished</h1>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <div className="bg-surface p-4">
          <p className="text-xs text-muted">Average score</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">
            {session.average ?? "–"}<span className="text-lg text-muted">/10</span>
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-muted">Questions answered</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">
            {session.answered}<span className="text-lg text-muted">/{session.total}</span>
          </p>
        </div>
      </div>
      <ol className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {session.answers.map((a, i) => (
          <li key={a.id} className="flex items-start gap-3 p-4">
            <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted">Q{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug"><Rich text={a.question.text} /></p>
              <p className="mt-1.5"><Location path={a.question.path} symbol={a.question.symbol} start={a.question.start_line} end={a.question.end_line} /></p>
            </div>
            <ScoreBadge score={a.score} />
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/progress" className="btn-primary">See progress <Icon name="arrow" /></Link>
        <button onClick={onRetry} className="btn-ghost"><Icon name="refresh" /> New interview</button>
      </div>
    </section>
  );
}
