"""Settings, read from environment variables (or backend/.env in development)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./repodefend.db"

    # Signs the session cookie. Must be overridden in production.
    jwt_secret: str = "dev-secret-change-me"
    session_days: int = 7
    cookie_secure: bool = False  # True in production (HTTPS only)

    # Where to send the browser after GitHub login.
    frontend_url: str = "http://localhost:3000"

    github_client_id: str = ""
    github_client_secret: str = ""
    # Optional server token: raises GitHub's API limit from 60 to 5,000 requests/hour.
    github_token: str = ""

    # Lets you log in without GitHub. Never enable in production.
    dev_login: bool = False

    llm_provider: str = "groq"  # "groq" or "fake" (offline, deterministic)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    run_worker: bool = True  # start the background job worker with the API

    # Ingest limits: keep one repo from eating the server or the LLM quota.
    max_repo_kb: int = 50_000
    max_files: int = 400
    max_file_kb: int = 200
    question_chunks: int = 10  # code chunks that get questions
    questions_per_chunk: int = 2

    # Per-user rate limits.
    repos_per_day: int = 5
    answers_per_hour: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
