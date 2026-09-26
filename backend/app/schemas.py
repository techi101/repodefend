"""Request and response shapes. FastAPI validates requests against these and
uses them to generate the /docs page."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ORM):
    id: int
    login: str
    name: str | None
    avatar_url: str | None


class RepoIn(BaseModel):
    url: str = Field(min_length=3, max_length=300)


class RepoOut(ORM):
    id: int
    owner: str
    name: str
    full_name: str
    description: str | None
    status: str
    progress: int
    status_detail: str | None
    error: str | None
    file_count: int
    chunk_count: int
    languages: dict
    question_count: int = 0
    created_at: datetime
    ready_at: datetime | None


class ChunkOut(ORM):
    id: int
    path: str
    language: str
    kind: str
    symbol: str | None
    start_line: int
    end_line: int
    content: str


class QuestionOut(ORM):
    id: int
    text: str
    topic: str
    difficulty: str
    path: str | None = None
    symbol: str | None = None
    start_line: int | None = None
    end_line: int | None = None


class QuestionDetail(QuestionOut):
    reference_answer: str
    chunk: ChunkOut | None


class SessionIn(BaseModel):
    repo_id: int
    count: int = Field(default=5, ge=1, le=10)


class AnswerIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class AnswerOut(BaseModel):
    id: int
    position: int
    question: QuestionOut
    code: ChunkOut | None
    text: str | None
    score: int | None
    feedback: str | None
    missed: list[str]
    reference_answer: str | None  # only revealed once answered
    answered_at: datetime | None


class SessionOut(BaseModel):
    id: int
    repo_id: int
    repo_full_name: str
    status: str
    created_at: datetime
    completed_at: datetime | None
    answered: int
    total: int
    average: float | None
    answers: list[AnswerOut] = []
