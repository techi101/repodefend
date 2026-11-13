"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorNote, Icon, LangBar, Loading, PageHeader, ProgressBar, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isWorking, type Repo } from "@/lib/types";

const STATUS: Record<Repo["status"], { label: string; cls: string; dot: string }> = {
  queued: { label: "Queued", cls: "text-ink-2", dot: "bg-muted" },
  fetching: { label: "Reading code", cls: "text-accent-ink", dot: "bg-accent animate-pulse" },
  generating: { label: "Writing questions", cls: "text-accent-ink", dot: "bg-accent animate-pulse" },
  ready: { label: "Ready", cls: "text-good-ink", dot: "bg-good" },
  failed: { label: "Failed", cls: "text-critical-ink", dot: "bg-critical" },
};

export default function Dashboard() {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<Repo[]>("/repos").then(setRepos).catch((e) => setError(errorText(e))), []);

  useEffect(() => { load(); }, [load]);

  // Poll only while something is still being processed.
  const busy = repos?.some((r) => isWorking(r.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [busy, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const repo = await api<Repo>("/repos", { method: "POST", json: { url } });
      setRepos((rs) => [repo, ...(rs ?? [])]);
      setUrl("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAdding(false);
    }
  }

  async function retry(id: number) {
    try {
      const repo = await api<Repo>(`/repos/${id}/retry`, { method: "POST" });
      setRepos((rs) => rs?.map((r) => (r.id === id ? repo : r)) ?? null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(repo: Repo) {
    if (!confirm(`Remove ${repo.full_name} and all its interview history?`)) return;
    await api(`/repos/${repo.id}`, { method: "DELETE" }).catch((e) => setError(errorText(e)));
    setRepos((rs) => rs?.filter((r) => r.id !== repo.id) ?? null);
  }

  return (
    <div>
      <PageHeader eyebrow="Step 1 · Connect repo" title="Your repos">
        Add a public GitHub repo you&rsquo;ll be asked about. Questions are written in the background.
      </PageHeader>

      <form onSubmit={add} className="mt-6">
        <label htmlFor="repo-url" className="text-sm font-medium">GitHub repo URL</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Icon name="github" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="repo-url" className="input pl-9 font-mono" placeholder="https://github.com/you/your-project" value={url}
                   onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <button className="btn-primary shrink-0" disabled={adding || !url.trim()}>
            {adding ? <Spinner /> : <Icon name="plus" />} Add repo
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted">public repos only · source files are read, weights and images are skipped</p>
      </form>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Repositories</h2>
          {repos && repos.length > 0 && <span className="font-mono text-xs text-muted">{repos.length} total</span>}
        </div>

        {repos === null && !error && <Loading label="Loading repos" />}
        {repos?.length === 0 && (
          <EmptyState icon="repo" title="No repos yet">
            Paste a GitHub URL above and click <span className="font-medium text-ink">Add repo</span>. Start with the
            project you&rsquo;re most likely to be grilled on.
          </EmptyState>
        )}

        {repos && repos.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {repos.map((r) => {
              const st = STATUS[r.status];
              return (
                <li key={r.id} className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {r.status === "ready" ? (
                        <Link href={`/repos/${r.id}`} className="truncate font-mono text-sm font-semibold hover:text-accent-ink">{r.full_name}</Link>
                      ) : (
                        <span className="truncate font-mono text-sm font-semibold">{r.full_name}</span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${st.cls}`}>
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                      </span>
                    </div>
                    {r.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{r.description}</p>}

                    {isWorking(r.status) && (
                      <div className="mt-3 max-w-xl rounded-md border border-line bg-code px-3 py-2.5">
                        <ProgressBar value={r.progress} label={`${r.progress}% · ${r.status_detail ?? st.label}`} />
                      </div>
                    )}
                    {r.status === "failed" && r.error && (
                      <p className="mt-2 rounded-md border border-critical/30 bg-critical-bg px-3 py-2 font-mono text-xs text-critical-ink">{r.error}</p>
                    )}

                    {Object.keys(r.languages).length > 0 && <div className="mt-3 max-w-md"><LangBar languages={r.languages} /></div>}
                    {r.file_count > 0 && (
                      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        <Stat label="files" value={r.file_count} />
                        <Stat label="code chunks" value={r.chunk_count} />
                        <Stat label="questions" value={r.question_count} />
                      </dl>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === "ready" && (
                      <Link href={`/repos/${r.id}`} className="btn-ghost">
                        Open questions <Icon name="arrow" />
                      </Link>
                    )}
                    {r.status === "failed" && (
                      <button onClick={() => retry(r.id)} className="btn-ghost"><Icon name="refresh" /> Retry</button>
                    )}
                    <button onClick={() => remove(r)} className="btn ml-auto px-2 text-muted hover:bg-critical-bg hover:text-critical-ink md:ml-0"
                            aria-label={`Remove ${r.full_name}`} title="Remove repo">
                      <Icon name="trash" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="order-first font-mono font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}
