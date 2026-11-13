"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorNote, Icon, Loading, PageHeader, ScoreBadge } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import type { Group, InterviewSession, Stats } from "@/lib/types";

const barColour = (v: number) => (v >= 7 ? "bg-good" : v >= 5 ? "bg-warning" : "bg-critical");

export default function ProgressPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState(false);

  useEffect(() => {
    Promise.all([api<Stats>("/stats"), api<InterviewSession[]>("/sessions")])
      .then(([st, ss]) => { setStats(st); setSessions(ss); })
      .catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!stats) return <Loading label="Loading progress" />;

  if (stats.answers === 0)
    return (
      <div>
        <PageHeader eyebrow="Step 4 · Review" title="Progress" />
        <div className="mt-8">
          <EmptyState icon="chart" title="No graded answers yet">
            Open a repo on the <Link href="/dashboard" className="font-medium text-accent-ink hover:underline">Repos</Link> page and
            click <span className="font-medium text-ink">Start mock interview</span>. Your scores show up here.
          </EmptyState>
        </div>
      </div>
    );

  const weakest = stats.by_topic[0];
  const groups = [...stats.by_difficulty.map((g) => ({ ...g, name: `${g.name} questions` })), ...stats.by_repo];
  const shownSessions = allRows ? sessions : sessions.slice(0, 8);

  return (
    <div>
      <PageHeader eyebrow="Step 4 · Review" title="Progress">Every graded answer, across all repos and interviews.</PageHeader>

      {/* Headline numbers are labelled stat tiles, not charts. */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Tile label="Average score" value={stats.average ?? "–"} unit="/10" sub="all graded answers" />
        <Tile label="Answers graded" value={stats.answers} sub="questions you replied to" />
        <Tile label="Interviews" value={stats.sessions} sub="mock sessions started" />
        <Tile label="Weakest topic" value={weakest?.name ?? "–"} sub={weakest ? `${weakest.average}/10 average over ${weakest.answers}` : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-medium">Average score by topic</h2>
          <p className="mt-0.5 text-xs text-muted">Weakest first · scale 0–10 · hover a row for detail</p>
          <BarList rows={stats.by_topic} />
        </section>
        <section className="card p-5">
          <h2 className="font-medium">Recent answers</h2>
          <p className="mt-0.5 text-xs text-muted">Last {stats.recent.length} graded answers, oldest → newest · scale 0–10</p>
          <Columns points={stats.recent} />
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="px-5 pt-5 font-medium">By difficulty and repo</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="px-5 py-2 font-normal">Group</th><th className="py-2 text-right font-normal">Answers</th><th className="px-5 py-2 text-right font-normal">Average /10</th></tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line tabular-nums">
                {groups.map((g) => (
                  <tr key={g.name}>
                    <td className="max-w-0 truncate px-5 py-2 font-mono text-xs">{g.name}</td>
                    <td className="py-2 text-right font-mono text-xs">{g.answers}</td>
                    <td className="px-5 py-2 text-right font-mono text-xs">{g.average}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="font-medium">Interview history</h2>
            <span className="font-mono text-xs text-muted">{sessions.length} total</span>
          </div>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {shownSessions.map((s) => (
              <li key={s.id}>
                <Link href={`/interview/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.repo_full_name}</span>
                  <span className="hidden font-mono text-[11px] text-muted sm:inline">{new Date(s.created_at).toLocaleDateString()}</span>
                  <span className="font-mono text-[11px] text-muted" title="answered / total">{s.answered}/{s.total} answered</span>
                  {s.average !== null ? <ScoreBadge score={Math.round(s.average)} /> : <span className="chip">{s.status}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {sessions.length > 8 && (
            <button onClick={() => setAllRows((v) => !v)} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 font-mono text-xs text-muted hover:text-ink">
              {allRows ? "Show less" : `Show more (${sessions.length - 8})`}
              <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${allRows ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <div className="min-w-0 bg-surface p-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p className={`mt-1.5 truncate font-mono font-semibold tabular-nums ${typeof value === "number" ? "text-3xl" : "text-lg capitalize leading-9"}`}>
        {value}{unit && <span className="text-base font-normal text-muted">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Horizontal bars on a fixed 0-10 domain so bars compare across visits; colour follows the score band. */
function BarList({ rows }: { rows: Group[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} tabIndex={0} className="group relative grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-3 text-sm outline-none">
          <span className="truncate capitalize text-ink-2">{r.name}</span>
          <span className="h-2.5 rounded-r-[3px] bg-surface-3">
            <span className={`block h-full rounded-r-[3px] ${barColour(r.average)}`} style={{ width: `${Math.max(r.average * 10, 1)}%` }} />
          </span>
          <span className="text-right font-mono text-xs tabular-nums">{r.average}</span>
          <Tooltip>{r.name}: {r.average}/10 average over {r.answers} answer{r.answers === 1 ? "" : "s"}</Tooltip>
        </li>
      ))}
    </ul>
  );
}

/** Columns over time. Hover or focus a column for its date, topic and score. */
function Columns({ points }: { points: Stats["recent"] }) {
  const H = 140;
  return (
    <div className="mt-4 pl-5">
      <div className="relative flex gap-[3px] border-b border-line-strong" style={{ height: H }}>
        {[5, 10].map((v) => (
          <div key={v} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: (v / 10) * H - 1 }}>
            <span className="absolute -left-1 -top-2 -translate-x-full font-mono text-[10px] text-muted">{v}</span>
          </div>
        ))}
        {points.map((p, i) => (
          <div key={i} className="group relative flex max-w-10 flex-1 items-end outline-none" tabIndex={0} aria-label={`${p.score} of 10, ${p.topic}`}>
            <div className={`w-full rounded-t-[3px] transition group-hover:brightness-125 group-focus:brightness-125 ${barColour(p.score)}`}
                 style={{ height: Math.max((p.score / 10) * H, 2) }} />
            <Tooltip below>{new Date(p.at).toLocaleString()} · {p.topic} · {p.score}/10</Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tooltip({ children, below }: { children: React.ReactNode; below?: boolean }) {
  return (
    <span role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink shadow-lg group-hover:block group-focus:block ${below ? "top-full mt-2" : "bottom-full mb-1"}`}>
      {children}
    </span>
  );
}
