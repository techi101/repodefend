"""Background job worker: a Postgres table used as a queue.

Why not Redis + Celery? One fewer service to run and pay for, and the job is
committed in the same transaction as the repo row, so "repo saved but job lost"
cannot happen.

Claiming uses SELECT ... FOR UPDATE SKIP LOCKED: each worker locks the row it
takes, and other workers skip locked rows instead of waiting. So you can run
several workers (or several servers) and no job is processed twice.
SQLite has no row locks; locally there is one worker thread, so that is fine.
"""
import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Job, Repo
from .services.github import RepoError
from .services.ingest import ingest_repo
from .services.llm import get_llm

log = logging.getLogger(__name__)
MAX_ATTEMPTS = 3
STALE_AFTER = timedelta(minutes=15)


def now() -> datetime:
    return datetime.now(timezone.utc)


def enqueue(db: Session, repo: Repo) -> Job:
    job = Job(kind="ingest_repo", repo_id=repo.id)
    db.add(job)
    return job


def claim_next(db: Session) -> Job | None:
    q = select(Job).where(Job.status == "queued").order_by(Job.id).limit(1)
    if db.bind.dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)
    job = db.scalars(q).first()
    if job is None:
        db.rollback()
        return None
    job.status, job.started_at, job.attempts = "running", now(), job.attempts + 1
    db.commit()  # releases the row lock; status="running" now keeps others off it
    return job


def recover_stale(db: Session) -> int:
    """Re-queue jobs left 'running' by a server that crashed or restarted mid-job."""
    res = db.execute(
        update(Job).where(Job.status == "running", Job.started_at < now() - STALE_AFTER)
        .values(status="queued")
    )
    db.commit()
    return res.rowcount


def run_job(db: Session, job: Job, llm=None, fetch=None) -> None:
    repo = db.get(Repo, job.repo_id)
    if repo is None:  # repo deleted while queued
        job.status, job.finished_at = "done", now()
        db.commit()
        return
    try:
        kwargs = {"fetch": fetch} if fetch else {}
        ingest_repo(db, repo, llm or get_llm(), **kwargs)
        job.status, job.finished_at = "done", now()
    except RepoError as e:
        # The user's problem (bad URL, too big): retrying will not help.
        db.rollback()
        _fail(db, job, repo, str(e))
    except Exception as e:
        db.rollback()
        log.exception("job %s failed (attempt %s)", job.id, job.attempts)
        if job.attempts < MAX_ATTEMPTS:
            job.status, job.error = "queued", str(e)[:1000]  # transient: try again
            repo.status, repo.status_detail = "queued", f"Retrying after an error (attempt {job.attempts}/{MAX_ATTEMPTS})"
        else:
            _fail(db, job, repo, f"Failed after {MAX_ATTEMPTS} attempts: {e}")
    db.commit()


def _fail(db: Session, job: Job, repo: Repo, msg: str) -> None:
    job.status, job.error, job.finished_at = "failed", msg[:1000], now()
    repo.status, repo.error, repo.status_detail = "failed", msg[:1000], None


def work_once(llm=None, fetch=None) -> bool:
    """Process one job if there is one. Returns whether it did."""
    with SessionLocal() as db:
        job = claim_next(db)
        if job is None:
            return False
        run_job(db, job, llm, fetch)
        return True


class Worker(threading.Thread):
    def __init__(self, poll_seconds: float = 1.0):
        super().__init__(daemon=True, name="job-worker")
        self.poll = poll_seconds
        self.stopping = threading.Event()

    def run(self) -> None:
        with SessionLocal() as db:
            if n := recover_stale(db):
                log.info("re-queued %s stale jobs", n)
        while not self.stopping.is_set():
            try:
                busy = work_once()
            except Exception:
                log.exception("worker loop error")
                busy = False
            if not busy:
                self.stopping.wait(self.poll)

    def stop(self) -> None:
        self.stopping.set()
