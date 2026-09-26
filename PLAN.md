# RepoDefend — build plan

**One line:** paste a GitHub repo, get the questions an interviewer would ask about
*that* code, answer them in a mock interview, and get scored against the code itself.

**Why it exists:** I build projects by directing AI. In interviews I have to defend
every line. This tool turns any repo into an interview drill.

## Features (MVP)

1. Sign in with GitHub (OAuth). Dev-only login for local work.
2. Add a public repo by URL. It is fetched, filtered and split into code chunks
   (functions / classes) in a **background job** with a live progress bar.
3. For the most substantial chunks, an LLM writes interview questions with a
   reference answer, each tied to the exact file and line range.
4. Question bank per repo: filter by difficulty, open the code a question is about.
5. Mock interview: N questions, one at a time, type an answer, get a 0–10 score,
   feedback, and what you missed.
6. Progress page: sessions, average score, weakest topics.
7. Per-user isolation (you only ever see your own repos and sessions) and per-user
   rate limits (protects the LLM quota).

## Architecture

```
Browser ──> Next.js (Vercel) ── /api/* rewrite ──> FastAPI (Render) ──> Postgres (Neon)
                                                        │
                                                        ├── worker thread: job queue
                                                        │   (jobs table, FOR UPDATE SKIP LOCKED)
                                                        ├── GitHub API (repo metadata + tarball)
                                                        └── Groq LLM (questions + grading)
```

- The frontend proxies `/api/*` to the backend, so the session cookie is
  **first-party** (no cross-site cookie problems between vercel.app and onrender.com).
- The job queue lives in Postgres, not Redis: one fewer service, and
  `SELECT … FOR UPDATE SKIP LOCKED` lets several workers share it safely.

## Data model

```
users ─< repos ─< code_chunks ─< questions
  │        │
  │        └─< jobs
  └─< interview_sessions ─< answers >─ questions
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | /api/auth/github/login | redirect to GitHub |
| GET | /api/auth/github/callback | exchange code, set cookie |
| POST | /api/auth/dev-login | local only |
| POST | /api/auth/logout | clear cookie |
| GET | /api/me | current user |
| GET / POST | /api/repos | list / add (queues ingest job) |
| GET / DELETE | /api/repos/{id} | status + progress / remove |
| POST | /api/repos/{id}/retry | re-queue a failed ingest |
| GET | /api/repos/{id}/questions | question bank |
| GET | /api/questions/{id} | one question + its code |
| GET / POST | /api/sessions | list / start interview |
| GET | /api/sessions/{id} | session with answers |
| POST | /api/sessions/{id}/answers/{answer_id} | submit + grade one answer |
| POST | /api/sessions/{id}/complete | finish |
| GET | /api/stats | progress numbers |

## Build order

| Step | What | Done when |
|---|---|---|
| 1 | Backend skeleton: config, DB, models, auth | `/api/me` works with dev login |
| 2 | Ingest: URL parsing, tarball fetch, filtering, chunking | real repo -> chunks, tests pass |
| 3 | Job queue + worker, progress updates | repo goes queued -> ready on its own |
| 4 | LLM layer (Groq + offline fake), question generation | questions tied to file:line |
| 5 | Sessions + grading + stats | full interview flow via API tests |
| 6 | Frontend: landing, dashboard, repo page, interview, progress | clickable end to end locally |
| 7 | GitHub OAuth app, deploy (Neon, Render, Vercel), README + screenshots | live link works |
| 8 | Later: Alembic migrations, CI, private repos, follow-up questions | — |
