"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ErrorNote, ProgressBar, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isWorking, type Repo } from "@/lib/types";

const STATUS_LABEL: Record<Repo["status"], string> = {
  queued: "Queued", fetching: "Reading code", generating: "Writing questions", ready: "Ready", failed: "Failed",
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
      <h1 className="text-2xl font-semibold tracking-tight">Your repos</h1>
      <p className="mt-1 text-sm text-ink-2">Add a public GitHub repo you’ll be asked about in interviews.</p>

      <form onSubmit={add} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input className="input font-mono" placeholder="https://github.com/you/your-project" value={url}
               onChange={(e) => setUrl(e.target.value)} required aria-label="GitHub repo URL" />
        <button className="btn-primary shrink-0" disabled={adding || !url.trim()}>
          {adding && <Spinner />} Add repo
        </button>
      </form>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {repos === null && <div className="text-muted"><Spinner /></div>}
        {repos?.length === 0 && (
          <div className="card col-span-full border-dashed p-10 text-center text-sm text-ink-2">
            No repos yet. Start with the project you’re most likely to be grilled on.
          </div>
        )}
        {repos?.map((r) => (
          <article key={r.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-mono text-sm font-semibold">{r.full_name}</h2>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{r.description}</p>}
              </div>
              <span className={`chip shrink-0 ${r.status === "failed" ? "border-critical/40 text-critical-ink" : r.status === "ready" ? "border-good/40 text-good-ink" : ""}`}>
                {r.status === "ready" ? "✓ " : r.status === "failed" ? "✕ " : ""}{STATUS_LABEL[r.status]}
              </span>
            </div>

            {isWorking(r.status) && <div className="mt-4"><ProgressBar value={r.progress} label={r.status_detail ?? undefined} /></div>}
            {r.status === "failed" && <p className="mt-3 text-sm text-critical-ink">{r.error}</p>}

            {Object.keys(r.languages).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Object.entries(r.languages).map(([lang, n]) => <span key={lang} className="chip">{lang} · {n}</span>)}
              </div>
            )}

            <div className="mt-auto flex items-center gap-2 pt-5 text-sm">
              {r.status === "ready" && (
                <Link href={`/repos/${r.id}`} className="btn-primary px-3 py-1.5">
                  {r.question_count} questions →
                </Link>
              )}
              {r.status === "failed" && <button onClick={() => retry(r.id)} className="btn-ghost px-3 py-1.5">Retry</button>}
              <span className="ml-auto text-xs text-muted">{r.file_count ? `${r.file_count} files · ${r.chunk_count} chunks` : ""}</span>
              <button onClick={() => remove(r)} className="text-xs text-muted hover:text-critical-ink" aria-label={`Remove ${r.full_name}`}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
