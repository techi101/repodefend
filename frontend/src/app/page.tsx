"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorNote, Logo } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type AuthConfig = { github: boolean; dev_login: boolean };

const SAMPLE = {
  where: "app.py:72-125 · detect_objects",
  q: "Why is this route handler a plain def instead of async def, and how does FastAPI run it without blocking the event loop?",
  score: 4,
  missed: ["FastAPI runs sync handlers in a threadpool", "YOLO inference is CPU-bound, so async would block"],
};

export default function Landing() {
  const router = useRouter();
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Already signed in? Go straight to the app.
    api("/me").then(() => router.replace("/dashboard")).catch(() => {});
    api<AuthConfig>("/auth/config").then(setCfg).catch(() => setError("The API is not reachable. Is the backend running?"));
  }, [router]);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/auth/dev-login", { method: "POST", json: { login: name || "me" } });
      router.push("/dashboard");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4">
      <header className="flex h-16 items-center"><Logo /></header>

      <section className="grid flex-1 items-center gap-12 py-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-4 font-mono text-xs uppercase tracking-widest text-accent">Interview prep, from your own code</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            They will ask about your projects.<br />
            <span className="text-ink-2">Know the answers.</span>
          </h1>
          <p className="mt-5 max-w-md text-ink-2">
            Paste a GitHub repo. RepoDefend reads the code, writes the questions an interviewer would ask about
            <em> that</em> code, then grades your answers against it.
          </p>

          <div className="mt-8 flex max-w-sm flex-col gap-3">
            {cfg?.github && (
              <a href="/api/auth/github/login" className="btn-primary py-2.5">
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" /></svg>
                Sign in with GitHub
              </a>
            )}
            {cfg?.dev_login && (
              <form onSubmit={devLogin} className="flex gap-2">
                <input className="input" placeholder="dev username" value={name} maxLength={40}
                       onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9-]/g, ""))} />
                <button className="btn-ghost shrink-0">Dev login</button>
              </form>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <p className="text-xs text-muted">Public repos only. We read your code, never store your GitHub token.</p>
          </div>
        </div>

        {/* A static example of what a graded answer looks like. */}
        <div className="card p-5 shadow-sm" aria-label="Example question">
          <p className="font-mono text-xs text-muted">{SAMPLE.where}</p>
          <p className="mt-2 font-medium leading-snug">{SAMPLE.q}</p>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
            “I made it sync because... I think it’s faster?”
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="rounded-full border border-critical/40 px-2 py-0.5 text-xs font-medium text-critical-ink">✕ {SAMPLE.score}/10 · Weak</span>
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">You missed</p>
          <ul className="mt-1 space-y-1 text-sm">
            {SAMPLE.missed.map((m) => <li key={m} className="flex gap-2"><span className="text-muted">–</span>{m}</li>)}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 border-t border-line py-10 text-sm sm:grid-cols-3">
        {[
          ["1 · Add a repo", "It’s split into functions and classes, and the most interview-worthy ones are picked."],
          ["2 · Get questions", "Design, failure cases, trade-offs, each tied to a file and line range."],
          ["3 · Practise", "Timed mock interviews, scored 0–10 with what you missed. Track your weakest topics."],
        ].map(([t, d]) => (
          <div key={t}><p className="font-medium">{t}</p><p className="mt-1 text-ink-2">{d}</p></div>
        ))}
      </section>
    </div>
  );
}
