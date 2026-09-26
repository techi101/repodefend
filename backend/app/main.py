"""FastAPI app: wires the routers together and starts the job worker."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .auth import router as auth_router
from .config import get_settings
from .db import Base, engine
from .routers import repos, sessions, stats
from .worker import Worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all only adds missing tables. Schema *changes* need migrations
    # (Alembic): that is on the roadmap.
    Base.metadata.create_all(engine)
    worker = None
    if get_settings().run_worker:
        worker = Worker()
        worker.start()
    yield
    if worker:
        worker.stop()


app = FastAPI(title="RepoDefend API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(auth_router)
app.include_router(repos.router)
app.include_router(sessions.router)
app.include_router(stats.router)


@app.get("/api/health")
def health():
    return {"ok": True}
