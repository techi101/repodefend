"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CodeBlock, DifficultyChip, ErrorNote, Location, Rich, ScoreBadge, Spinner } from "@/components/ui";
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
  if (!session) return <Spinner className="text-muted" />;

  const done = summary;
  const current = session.answers[index];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/repos/${session.repo_id}`} className="truncate font-mono text-sm text-muted hover:text-ink">
          ← {session.repo_full_name}
        </Link>
        {session.status === "active" && <button onClick={finish} className="shrink-0 whitespace-nowrap text-sm text-muted hover:text-ink">End interview</button>}
      </div>

      {/* One step per question: filled once answered, ringed when current. */}
      <ol className="mt-5 flex gap-1.5" aria-label="Questions">
        {session.answers.map((a, i) => (
          <li key={a.id} className="flex-1">
            <button onClick={() => setIndex(i)} aria-current={i === index && !done ? "step" : undefined}
              aria-label={`Question ${i + 1}${a.score !== null ? `, scored ${a.score} of 10` : ""}`}
              className={`h-1.5 w-full rounded-full transition ${a.score !== null ? "bg-accent" : "bg-surface-2"} ${i === index && !done ? "ring-2 ring-accent/40 ring-offset-2 ring-offset-bg" : ""}`} />
          </li>
        ))}
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
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Question {number} of {total}</span>
        {!answered && <span className="font-mono tabular-nums" aria-label="Time on this question">{elapsed}</span>}
      </div>
      <h1 className="mt-2 text-xl font-medium leading-snug"><Rich text={q.text} /></h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DifficultyChip d={q.difficulty} />
        <span className="chip">{q.topic}</span>
        <Location path={q.path} symbol={q.symbol} start={q.start_line} end={q.end_line} />
      </div>

      {answer.code && (
        <div className="mt-4">
          <button onClick={() => setShowCode((s) => !s)} className="text-sm text-accent-ink hover:underline" aria-expanded={showCode}>
            {showCode ? "Hide the code" : "Peek at the code"}
          </button>
          {showCode && <div className="mt-2"><CodeBlock chunk={answer.code} maxHeight="20rem" /></div>}
        </div>
      )}

      {!answered ? (
        <div className="mt-6">
          <label htmlFor="answer" className="sr-only">Your answer</label>
          <textarea id="answer" className="input min-h-44 resize-y leading-relaxed" autoFocus maxLength={4000}
            placeholder="Answer as you would out loud: what it does, why it's built this way, what breaks…"
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }} />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{text.length}/4000 · Ctrl+Enter to submit</span>
            <button onClick={submit} disabled={!text.trim() || grading} className="btn-primary">
              {grading ? <><Spinner /> Grading…</> : "Submit answer"}
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
    <div className="mt-6 space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ScoreBadge score={answer.score} size="lg" />
          <button onClick={onNext} className="btn-primary">{isLast ? "See results →" : "Next question →"}</button>
        </div>
        <p className="mt-4 leading-relaxed"><Rich text={answer.feedback} /></p>
        {answer.missed.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">You missed</p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {answer.missed.map((m) => <li key={m} className="flex gap-2"><span aria-hidden className="text-muted">–</span><span><Rich text={m} /></span></li>)}
            </ul>
          </>
        )}
      </div>
      <details className="card p-4 text-sm" open>
        <summary className="cursor-pointer font-medium">What a strong answer covers</summary>
        <p className="mt-2 leading-relaxed text-ink-2"><Rich text={answer.reference_answer} /></p>
      </details>
      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Your answer</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-2">{answer.text}</p>
      </details>
    </div>
  );
}

function Summary({ session, onRetry }: { session: InterviewSession; onRetry: () => void }) {
  return (
    <section className="mt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Interview finished</h1>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="text-5xl font-semibold tabular-nums">
          {session.average ?? "–"}<span className="text-xl text-muted">/10</span>
        </p>
        <p className="text-sm text-ink-2">average over {session.answered} of {session.total} questions</p>
      </div>
      <ol className="mt-6 space-y-2">
        {session.answers.map((a, i) => (
          <li key={a.id} className="card flex items-start gap-3 p-4">
            <span className="w-5 shrink-0 text-sm tabular-nums text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug"><Rich text={a.question.text} /></p>
              <p className="mt-1"><Location path={a.question.path} symbol={a.question.symbol} start={a.question.start_line} end={a.question.end_line} /></p>
            </div>
            <ScoreBadge score={a.score} />
          </li>
        ))}
      </ol>
      <div className="mt-6 flex gap-2">
        <button onClick={onRetry} className="btn-primary">New interview</button>
        <Link href="/progress" className="btn-ghost">See progress</Link>
      </div>
    </section>
  );
}
