"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorNote, ScoreBadge, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import type { Group, InterviewSession, Stats } from "@/lib/types";

export default function ProgressPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Stats>("/stats"), api<InterviewSession[]>("/sessions")])
      .then(([st, ss]) => { setStats(st); setSessions(ss); })
      .catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!stats) return <Spinner className="text-muted" />;

  if (stats.answers === 0)
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <div className="card mt-6 border-dashed p-10 text-center text-sm text-ink-2">
          No graded answers yet. <Link href="/dashboard" className="text-accent-ink hover:underline">Start a mock interview</Link> and your scores will show up here.
        </div>
      </div>
    );

  const weakest = stats.by_topic[0];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>

      {/* Headline numbers are stat tiles, not charts. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Average score" value={stats.average ?? "–"} unit="/10" hero />
        <Tile label="Answers graded" value={stats.answers} />
        <Tile label="Interviews" value={stats.sessions} />
        <Tile label="Weakest topic" value={weakest?.name ?? "–"} sub={weakest ? `${weakest.average}/10 over ${weakest.answers}` : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-medium">Average score by topic</h2>
          <p className="text-xs text-muted">Weakest first · scale 0–10</p>
          <BarList rows={stats.by_topic} />
        </section>
        <section className="card p-5">
          <h2 className="font-medium">Recent answers</h2>
          <p className="text-xs text-muted">Last {stats.recent.length} graded answers, oldest → newest · scale 0–10</p>
          <Columns points={stats.recent} />
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="px-5 pt-5 font-medium">By difficulty and repo</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="px-5 py-2 font-normal">Group</th><th className="py-2 text-right font-normal">Answers</th><th className="px-5 py-2 text-right font-normal">Average</th></tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line tabular-nums">
              {[...stats.by_difficulty.map((g) => ({ ...g, name: `${g.name} questions` })), ...stats.by_repo].map((g) => (
                <tr key={g.name}><td className="px-5 py-2 font-mono text-xs">{g.name}</td><td className="py-2 text-right">{g.answers}</td><td className="px-5 py-2 text-right">{g.average}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-hidden">
          <h2 className="px-5 pt-5 font-medium">Interview history</h2>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/interview/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.repo_full_name}</span>
                  <span className="text-xs text-muted">{new Date(s.created_at).toLocaleDateString()}</span>
                  <span className="text-xs text-muted">{s.answered}/{s.total}</span>
                  {s.average !== null ? <ScoreBadge score={Math.round(s.average)} /> : <span className="chip">{s.status}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, sub, hero }: { label: string; value: string | number; unit?: string; sub?: string; hero?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 truncate font-semibold tabular-nums ${hero ? "text-4xl" : typeof value === "number" ? "text-3xl" : "text-lg capitalize leading-9"}`}>
        {value}{unit && <span className="text-base font-normal text-muted">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Horizontal bars, one hue, fixed 0-10 domain so bars compare across visits. */
function BarList({ rows }: { rows: Group[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} className="group relative grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate capitalize text-ink-2">{r.name}</span>
          <span className="h-3 rounded-r-[4px] bg-surface-2">
            <span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${Math.max(r.average * 10, 1)}%` }} />
          </span>
          <span className="text-right tabular-nums">{r.average}</span>
          <Tooltip>{r.name}: {r.average}/10 average over {r.answers} answer{r.answers === 1 ? "" : "s"}</Tooltip>
        </li>
      ))}
    </ul>
  );
}

/** Columns over time. Hover a column for its date, topic and score. */
function Columns({ points }: { points: Stats["recent"] }) {
  const H = 140;
  return (
    <div className="mt-4">
      <div className="relative flex gap-[2px] border-b border-line" style={{ height: H }}>
        {/* recessive gridlines at 5 and 10 */}
        {[5, 10].map((v) => (
          <div key={v} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: (v / 10) * H - 1 }}>
            <span className="absolute -top-2 -left-0.5 -translate-x-full pr-1 text-[10px] text-muted">{v}</span>
          </div>
        ))}
        {points.map((p, i) => (
          <div key={i} className="group relative flex max-w-10 flex-1 items-end" tabIndex={0} aria-label={`${p.score} of 10, ${p.topic}`}>
            <div className="w-full rounded-t-[4px] bg-accent transition group-hover:brightness-125"
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
      className={`pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow-md group-hover:block group-focus:block ${below ? "top-full mt-2" : "bottom-full mb-1"}`}>
      {children}
    </span>
  );
}
