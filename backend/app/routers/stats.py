"""Progress numbers, computed in SQL with GROUP BY rather than in Python loops."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Answer, InterviewSession, Question, Repo, User
from ..schemas import UserOut

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.get("/stats")
def stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Every graded answer of this user, with its question's topic/difficulty.
    sub = (select(Answer.score, Answer.answered_at, Question.topic, Question.difficulty, InterviewSession.repo_id)
           .select_from(Answer)
           .join(Question, Answer.question_id == Question.id)
           .join(InterviewSession, Answer.session_id == InterviewSession.id)
           .where(InterviewSession.user_id == user.id, Answer.score.is_not(None))
           .subquery())

    total, avg = db.execute(select(func.count(), func.avg(sub.c.score))).one()

    def grouped(col):
        rows = db.execute(select(col, func.count(), func.avg(sub.c.score)).group_by(col)
                          .order_by(func.avg(sub.c.score))).all()
        return [{"name": n, "answers": c, "average": round(float(a), 1)} for n, c, a in rows]

    by_repo = db.execute(
        select(Repo.owner, Repo.name, func.count(), func.avg(sub.c.score))
        .join(sub, sub.c.repo_id == Repo.id).group_by(Repo.id, Repo.owner, Repo.name)
    ).all()
    recent = db.execute(select(sub.c.answered_at, sub.c.score, sub.c.topic)
                        .order_by(sub.c.answered_at.desc()).limit(30)).all()

    sessions = db.scalar(select(func.count()).where(InterviewSession.user_id == user.id))
    return {
        "sessions": sessions,
        "answers": total,
        "average": round(float(avg), 1) if avg is not None else None,
        "by_topic": grouped(sub.c.topic),  # weakest first
        "by_difficulty": grouped(sub.c.difficulty),
        "by_repo": [{"name": f"{o}/{n}", "answers": c, "average": round(float(a), 1)} for o, n, c, a in by_repo],
        "recent": [{"at": at, "score": s, "topic": t} for at, s, t in reversed(recent)],
    }
