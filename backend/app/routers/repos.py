"""Repos and their question bank. Every query is filtered by the signed-in
user, and another user's repo returns 404 (not 403), so ids leak nothing."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user
from ..config import get_settings
from ..db import get_db
from ..models import CodeChunk, Question, Repo, User
from ..schemas import ChunkOut, QuestionDetail, QuestionOut, RepoIn, RepoOut
from ..services.github import RepoError, parse_repo_url
from ..worker import enqueue

router = APIRouter(prefix="/api", tags=["repos"])


def own_repo(db: Session, user: User, repo_id: int) -> Repo:
    repo = db.get(Repo, repo_id)
    if repo is None or repo.user_id != user.id:
        raise HTTPException(404, "Repo not found")
    return repo


def repo_out(db: Session, repo: Repo) -> RepoOut:
    out = RepoOut.model_validate(repo)
    out.question_count = db.scalar(select(func.count()).where(Question.repo_id == repo.id)) or 0
    return out


def question_out(q: Question) -> QuestionOut:
    out = QuestionOut.model_validate(q)
    if q.chunk:
        out.path, out.symbol = q.chunk.path, q.chunk.symbol
        out.start_line, out.end_line = q.chunk.start_line, q.chunk.end_line
    return out


@router.get("/repos", response_model=list[RepoOut])
def list_repos(user: User = Depends(current_user), db: Session = Depends(get_db)):
    repos = db.scalars(select(Repo).where(Repo.user_id == user.id).order_by(Repo.created_at.desc()))
    return [repo_out(db, r) for r in repos]


@router.post("/repos", response_model=RepoOut, status_code=201)
def add_repo(body: RepoIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        owner, name = parse_repo_url(body.url)
    except RepoError as e:
        raise HTTPException(422, str(e))

    existing = db.scalar(select(Repo).where(Repo.user_id == user.id, func.lower(Repo.owner) == owner.lower(),
                                            func.lower(Repo.name) == name.lower()))
    if existing:
        raise HTTPException(409, f"You already added {existing.full_name}")

    limit = get_settings().repos_per_day
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = db.scalar(select(func.count()).where(Repo.user_id == user.id, Repo.created_at >= since))
    if recent >= limit:
        raise HTTPException(429, f"Limit is {limit} new repos per day; try again tomorrow.")

    repo = Repo(user_id=user.id, owner=owner, name=name, status="queued", status_detail="Waiting for a worker")
    db.add(repo)
    try:
        db.flush()
        enqueue(db, repo)
        db.commit()  # repo and job saved together, or neither
    except IntegrityError:  # a double-click raced past the check above
        db.rollback()
        raise HTTPException(409, f"You already added {owner}/{name}")
    return repo_out(db, repo)


@router.get("/repos/{repo_id}", response_model=RepoOut)
def get_repo(repo_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return repo_out(db, own_repo(db, user, repo_id))


@router.delete("/repos/{repo_id}", status_code=204)
def delete_repo(repo_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own_repo(db, user, repo_id))
    db.commit()


@router.post("/repos/{repo_id}/retry", response_model=RepoOut)
def retry_repo(repo_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repo = own_repo(db, user, repo_id)
    if repo.status != "failed":
        raise HTTPException(409, "Only a failed repo can be retried")
    repo.status, repo.progress, repo.error, repo.status_detail = "queued", 0, None, "Waiting for a worker"
    enqueue(db, repo)
    db.commit()
    return repo_out(db, repo)


@router.get("/repos/{repo_id}/questions", response_model=list[QuestionOut])
def list_questions(repo_id: int, difficulty: str | None = None,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    own_repo(db, user, repo_id)
    q = select(Question).where(Question.repo_id == repo_id).order_by(Question.id)
    if difficulty:
        q = q.where(Question.difficulty == difficulty)
    return [question_out(x) for x in db.scalars(q)]


@router.get("/questions/{question_id}", response_model=QuestionDetail)
def get_question(question_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.get(Question, question_id)
    if q is None or q.repo.user_id != user.id:
        raise HTTPException(404, "Question not found")
    out = QuestionDetail(**question_out(q).model_dump(), reference_answer=q.reference_answer,
                         chunk=ChunkOut.model_validate(q.chunk) if q.chunk else None)
    return out


@router.get("/repos/{repo_id}/chunks", response_model=list[ChunkOut])
def list_chunks(repo_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The top-ranked chunks: what the question generator looked at."""
    own_repo(db, user, repo_id)
    return db.scalars(select(CodeChunk).where(CodeChunk.repo_id == repo_id)
                      .order_by(CodeChunk.score.desc()).limit(30)).all()
