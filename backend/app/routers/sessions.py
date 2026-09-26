"""Mock interviews: start a session, answer one question at a time, get graded."""
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..config import get_settings
from ..db import get_db
from ..models import Answer, InterviewSession, Question, User
from ..schemas import AnswerIn, AnswerOut, ChunkOut, SessionIn, SessionOut
from ..services.llm import LLMError, get_llm
from .repos import own_repo, question_out

router = APIRouter(prefix="/api", tags=["sessions"])
DIFFICULTY_ORDER = {"easy": 0, "medium": 1, "hard": 2}


def own_session(db: Session, user: User, session_id: int) -> InterviewSession:
    s = db.get(InterviewSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "Session not found")
    return s


def session_out(s: InterviewSession, with_answers: bool = True) -> SessionOut:
    graded = [a.score for a in s.answers if a.score is not None]
    out = SessionOut(
        id=s.id, repo_id=s.repo_id, repo_full_name=s.repo.full_name, status=s.status,
        created_at=s.created_at, completed_at=s.completed_at, answered=len(graded), total=len(s.answers),
        average=round(sum(graded) / len(graded), 1) if graded else None,
    )
    if with_answers:
        out.answers = [
            AnswerOut(
                id=a.id, position=a.position, question=question_out(a.question),
                code=ChunkOut.model_validate(a.question.chunk) if a.question.chunk else None,
                text=a.text, score=a.score, feedback=a.feedback, missed=a.missed or [],
                # Hidden until answered: otherwise the "interview" is open-book.
                reference_answer=a.question.reference_answer if a.score is not None else None,
                answered_at=a.answered_at,
            )
            for a in s.answers
        ]
    return out


def pick_questions(db: Session, user: User, repo_id: int, count: int) -> list[Question]:
    """Questions this user has never been asked come first; then the rest.
    The chosen set is ordered easy -> hard, like a real interview warms up."""
    pool = list(db.scalars(select(Question).where(Question.repo_id == repo_id)))
    asked = set(db.scalars(
        select(Answer.question_id).join(InterviewSession).where(InterviewSession.user_id == user.id)
    ))
    fresh = [q for q in pool if q.id not in asked]
    seen = [q for q in pool if q.id in asked]
    random.shuffle(fresh)
    random.shuffle(seen)
    chosen = (fresh + seen)[:count]
    return sorted(chosen, key=lambda q: DIFFICULTY_ORDER.get(q.difficulty, 1))


@router.post("/sessions", response_model=SessionOut, status_code=201)
def start_session(body: SessionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repo = own_repo(db, user, body.repo_id)
    if repo.status != "ready":
        raise HTTPException(409, "This repo's questions are not ready yet")
    questions = pick_questions(db, user, repo.id, body.count)
    if not questions:
        raise HTTPException(409, "This repo has no questions")
    s = InterviewSession(user_id=user.id, repo_id=repo.id)
    s.answers = [Answer(question_id=q.id, position=i) for i, q in enumerate(questions)]
    db.add(s)
    db.commit()
    db.refresh(s)
    return session_out(s)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(InterviewSession).where(InterviewSession.user_id == user.id)
                      .order_by(InterviewSession.created_at.desc()).limit(50))
    return [session_out(s, with_answers=False) for s in rows]


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return session_out(own_session(db, user, session_id))


@router.post("/sessions/{session_id}/answers/{answer_id}", response_model=SessionOut)
def submit_answer(session_id: int, answer_id: int, body: AnswerIn,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = own_session(db, user, session_id)
    if s.status != "active":
        raise HTTPException(409, "This interview is already finished")
    answer = next((a for a in s.answers if a.id == answer_id), None)
    if answer is None:
        raise HTTPException(404, "Answer slot not found")
    if answer.score is not None:
        raise HTTPException(409, "Already answered; no second attempts in an interview")

    limit = get_settings().answers_per_hour
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = db.scalar(select(func.count()).select_from(Answer).join(InterviewSession)
                       .where(InterviewSession.user_id == user.id, Answer.answered_at >= since))
    if recent >= limit:
        raise HTTPException(429, f"Limit is {limit} graded answers per hour.")

    q = answer.question
    code = q.chunk.content if q.chunk else "(architecture question: about the repo as a whole)"
    try:
        grade = get_llm().grade(q.text, q.reference_answer, code, body.text.strip())
    except LLMError as e:
        # Nothing saved: the user can resubmit the same answer.
        raise HTTPException(502, f"The grader is unavailable right now ({e}). Your answer was not used up.")

    answer.text, answer.score, answer.feedback, answer.missed = body.text.strip(), grade.score, grade.feedback, grade.missed
    answer.answered_at = datetime.now(timezone.utc)
    if all(a.score is not None for a in s.answers):
        s.status, s.completed_at = "completed", datetime.now(timezone.utc)
    db.commit()
    return session_out(s)


@router.post("/sessions/{session_id}/complete", response_model=SessionOut)
def complete_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """End early. Unanswered questions stay unscored (not counted as zero)."""
    s = own_session(db, user, session_id)
    if s.status == "active":
        s.status, s.completed_at = "completed", datetime.now(timezone.utc)
        db.commit()
    return session_out(s)
