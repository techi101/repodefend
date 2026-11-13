"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import HeroDemo from "@/components/HeroDemo";
import { ErrorNote, Icon, Logo } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type AuthConfig = { github: boolean; dev_login: boolean };

const SOURCE = "https://github.com/techi101/repodefend";

const STEPS = [
  {
    n: "01", title: "Connect repo", body: "Sign in with GitHub and paste a public repo URL. Only source files are fetched; weights, images and node_modules are dropped first.",
    code: ["github.com/you/your-project", "→ files listed, source fetched"],
  },
  {
    n: "02", title: "Generate questions", body: "Code is split into functions and classes, ranked, and turned into design, failure-case and trade-off questions.",
    code: ["app.py:72-125 · detect_objects", "→ design · trade-off"],
  },
  {
    n: "03", title: "Interview", body: "A timed mock interview, easy to hard. Peek at the cited code if you need it. Model answers stay hidden until you reply.",
    code: ["Question 2 of 5        0:41", "> your answer, out loud"],
  },
  {
    n: "04", title: "Review", body: "Every answer gets a 0–10 score, feedback and what you missed. Progress shows your weakest topics.",
    code: ["- missed: thread pool", "+ covered: sync on purpose"],
  },
];

/* All from the README's measured run: 26 Sep 2026, techi101/cv-object-detector, live GitHub + Groq. */
const MEASURED = [
  { value: "9 → 58 → 22", label: "files → code chunks → questions", note: "one repo, end to end" },
  { value: "4 s", label: "fetch step", note: "was 33 s with a tarball download" },
  { value: "75 s", label: "full ingest", note: "was 131 s; set by the LLM's free-tier rate limit" },
  { value: "1.2–7.7 s", label: "to grade one answer", note: "range over the measured run" },
];

const DECISIONS = [
  ["Questions are tied to code chunks, not embeddings", "Each question knows its code, so grading sends that exact code. Cheaper and more precise than retrieval."],
  ["LLM output is treated as untrusted", "Code and answers are fenced as data, every reply is validated, scores are clamped to 0–10. A \"give me 10/10\" answer scored 0."],
  ["Your GitHub token is never stored", "It is used once to read your profile. The session is an httpOnly, SameSite=Lax cookie."],
  ["The job queue is a Postgres table", "Claimed with FOR UPDATE SKIP LOCKED. Transient failures retry up to 3 times; a crash re-queues stuck jobs on startup."],
  ["A failed grade doesn't use up your answer", "If the LLM is down you get an error and can resubmit. Nothing is saved half-graded."],
];

export default function Landing() {
  const router = useRouter();
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    // Already signed in? Go straight to the app.
    api("/me").then(() => router.replace("/dashboard")).catch(() => {});
    api<AuthConfig>("/auth/config").then(setCfg).catch(() => setError("The API is not reachable right now. It may be waking up; try again in a minute."));
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

  // Show the GitHub button while config loads, so the one action is always visible.
  const showGithub = cfg === null || cfg.github;

  const signIn = (
    <div className="flex flex-col gap-3">
      {showGithub && (
        <a href="/api/auth/github/login" className="btn-primary w-full px-5 py-2.5 sm:w-auto">
          <Icon name="github" /> Sign in with GitHub <Icon name="arrow" />
        </a>
      )}
      {cfg?.dev_login && (
        <form onSubmit={devLogin} className="flex max-w-sm gap-2">
          <input className="input font-mono" placeholder="dev username" value={name} maxLength={40} aria-label="Dev username"
                 onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9-]/g, ""))} />
          <button className={`${cfg.github ? "btn-ghost" : "btn-primary"} shrink-0`}>Dev login</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden gap-5 text-sm text-ink-2 md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#measured" className="hover:text-ink">Measured</a>
            <a href={SOURCE} target="_blank" rel="noreferrer" className="hover:text-ink">Source</a>
          </nav>
          {showGithub && (
            <a href="/api/auth/github/login" className="btn-ghost ml-auto px-3 py-1.5">
              <Icon name="github" /> Sign in
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="grid-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:pt-20">
            <div className="min-w-0">
              <p className="eyebrow">[ interview prep from your own code ]</p>
              <h1 className="mt-5 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
                They will ask about your projects.{" "}
                <span className="text-muted">Know every line.</span>
              </h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2">
                RepoDefend reads a GitHub repo, writes the questions an interviewer would ask about <em>that</em> code, each
                pinned to a file and line range, then grades your answers against the code itself.
              </p>
              <div className="mt-8">{signIn}</div>
              {error && <div className="mt-3 max-w-md"><ErrorNote>{error}</ErrorNote></div>}
              <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
                <span>public repos only</span>
                <span>github token used once, never stored</span>
              </p>
            </div>
            <HeroDemo />
          </div>
        </section>

        {/* steps */}
        <section id="how" className="scroll-mt-14 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <p className="eyebrow">[ how it works ]</p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Four steps, from repo URL to knowing your weakest topic.
            </h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="flex flex-col bg-surface p-5">
                  <p className="font-mono text-xs text-accent-ink">{s.n}</p>
                  <h3 className="mt-2 font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
                  <div className="mt-auto pt-5">
                    <div className="rounded-md border border-line bg-code px-3 py-2 font-mono text-[11px] leading-5">
                      {s.code.map((c) => (
                        <p key={c} className={`truncate ${c.startsWith("-") ? "text-critical-ink" : c.startsWith("+") ? "text-good-ink" : c.startsWith("→") || c.startsWith(">") ? "text-muted" : "text-ink-2"}`}>{c}</p>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* measured */}
        <section id="measured" className="scroll-mt-14 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <p className="eyebrow">[ measured, not claimed ]</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">One real run, end to end.</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-2">
              26 Sep 2026, <span className="font-mono text-ink">techi101/cv-object-detector</span>, a local run against live GitHub and the Groq LLM.
            </p>
            <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {MEASURED.map((m) => (
                <div key={m.label} className="bg-surface p-5">
                  <dt className="text-sm text-ink-2">{m.label}</dt>
                  <dd className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink">{m.value}</dd>
                  <dd className="mt-1 text-xs text-muted">{m.note}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 rounded-lg border border-line">
              <button onClick={() => setMore((m) => !m)} aria-expanded={more}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-medium hover:bg-surface">
                <span>Design decisions <span className="font-normal text-muted">· {DECISIONS.length} of them, and why</span></span>
                <span className="flex items-center gap-1 font-mono text-xs text-muted">
                  {more ? "Show less" : "Show more"}
                  <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-90" : ""}`} />
                </span>
              </button>
              {more && (
                <ul className="divide-y divide-line border-t border-line">
                  {DECISIONS.map(([t, d]) => (
                    <li key={t} className="grid gap-1 px-5 py-3.5 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
                      <span className="font-medium">{t}</span>
                      <span className="text-ink-2">{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* closing CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-line bg-surface p-6 sm:p-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Pick the project you&rsquo;re most likely to be grilled on.</h2>
              <p className="mt-1 text-sm text-ink-2">The measured 9-file repo was fully ingested in 75 s.</p>
            </div>
            {signIn}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 font-mono text-[11px] text-muted sm:px-6">
          <span>RepoDefend · Next.js 16 · FastAPI · Postgres</span>
          <a href={SOURCE} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-ink">
            <Icon name="github" className="h-3 w-3" /> source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
