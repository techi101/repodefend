"""The ingest pipeline one background job runs for one repo.

fetch (GitHub) -> extract sources -> chunk + rank -> LLM questions -> ready

Progress is written to the repo row as it goes, and the frontend polls it.
"""
import logging
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import CodeChunk, Question, Repo
from . import github
from .chunker import chunk_file, pick_for_questions
from .github import SourceFile
from .llm import LLM, LLMError

log = logging.getLogger(__name__)
LLM_PARALLEL = 2  # free tier is 8,000 tokens/minute: more parallel calls just queue on 429s

# (metadata, source files, README text)
Fetched = tuple[dict, list[SourceFile], str | None]


def fetch_from_github(owner: str, name: str) -> Fetched:
    meta = github.fetch_metadata(owner, name)
    # Pin to the commit sha, not the branch name: a push mid-fetch cannot mix versions.
    sha = github.head_sha(owner, name, meta["default_branch"])
    files, readme = github.fetch_sources(owner, name, sha)
    return meta, files, readme


def _set(db: Session, repo: Repo, status: str, progress: int, detail: str) -> None:
    repo.status, repo.progress, repo.status_detail = status, progress, detail
    db.commit()


def file_tree(files: list[SourceFile], limit: int = 150) -> str:
    return "\n".join(f.path for f in files[:limit])


def ingest_repo(db: Session, repo: Repo, llm: LLM, fetch: Callable[[str, str], Fetched] = fetch_from_github) -> None:
    s = get_settings()
    # Start clean, so a retried job never leaves duplicates behind.
    db.execute(delete(Question).where(Question.repo_id == repo.id))
    db.execute(delete(CodeChunk).where(CodeChunk.repo_id == repo.id))
    repo.error = None
    _set(db, repo, "fetching", 5, "Downloading repo from GitHub")

    meta, files, readme = fetch(repo.owner, repo.name)
    repo.description = meta.get("description")
    repo.default_branch = meta.get("default_branch")
    if not files:
        raise github.RepoError("No source files found (supported: Python, JS/TS, Java, Go, Rust, C/C++, C#, Ruby, PHP, Kotlin, Swift, SQL).")
    repo.file_count = len(files)
    repo.languages = dict(Counter(f.language for f in files).most_common())
    _set(db, repo, "fetching", 20, f"Splitting {len(files)} files into chunks")

    chunks = [c for f in files for c in chunk_file(f)]
    rows = {}
    for c in chunks:
        row = CodeChunk(repo_id=repo.id, path=c.path, language=c.language, kind=c.kind, symbol=c.symbol,
                        start_line=c.start_line, end_line=c.end_line, content=c.content, score=c.score)
        db.add(row)
        rows[id(c)] = row
    repo.chunk_count = len(chunks)
    db.flush()  # assigns chunk ids

    picked = pick_for_questions(chunks, s.question_chunks)
    if not picked:
        raise github.RepoError("Found code, but nothing substantial enough to ask about.")
    steps = len(picked) + 1
    made, failures = 0, 0

    _set(db, repo, "generating", 30, "Writing architecture questions")
    try:
        for q in llm.questions_for_repo(repo.full_name, readme or "(no README)", file_tree(files), 2):
            db.add(Question(repo_id=repo.id, chunk_id=None, text=q.question, topic=q.topic,
                            difficulty=q.difficulty, reference_answer=q.reference_answer))
            made += 1
    except LLMError as e:
        failures += 1
        log.warning("repo-level questions failed for %s: %s", repo.full_name, e)

    # LLM calls are slow (~5-15 s) and mostly waiting on the network, so run a few
    # at once. Only this thread touches the DB session (sessions are not thread-safe);
    # the pool threads just call the LLM and hand back results.
    with ThreadPoolExecutor(max_workers=LLM_PARALLEL) as pool:
        futures = {pool.submit(llm.questions_for_chunk, repo.full_name, c.path, c.symbol, c.content,
                               s.questions_per_chunk): c for c in picked}
        for i, fut in enumerate(as_completed(futures), 1):
            c = futures[fut]
            label = f"{c.path}::{c.symbol}" if c.symbol else c.path
            try:
                qs = fut.result()
            except LLMError as e:
                failures += 1  # one bad chunk should not sink the whole repo
                log.warning("questions failed for %s: %s", label, e)
                qs = []
            for q in qs:
                db.add(Question(repo_id=repo.id, chunk_id=rows[id(c)].id, text=q.question, topic=q.topic,
                                difficulty=q.difficulty, reference_answer=q.reference_answer))
                made += 1
            _set(db, repo, "generating", 30 + int(65 * (i + 1) / steps), f"Wrote questions for {label} ({i}/{len(picked)})")

    if made == 0:
        raise LLMError(f"The question generator failed on all {failures} attempts.")
    repo.ready_at = datetime.now(timezone.utc)
    detail = f"{made} questions ready" + (f" ({failures} chunks skipped after LLM errors)" if failures else "")
    _set(db, repo, "ready", 100, detail)
