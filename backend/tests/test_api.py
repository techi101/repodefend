from fastapi.testclient import TestClient

from app import auth, worker
from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import Job, Repo
from app.services.github import RepoError

from .conftest import fake_fetch, login


def add_and_ingest(client, url="techi101/demo", fetch=fake_fetch):
    r = client.post("/api/repos", json={"url": url})
    assert r.status_code == 201, r.text
    assert worker.work_once(fetch=fetch)
    return client.get(f"/api/repos/{r.json()['id']}").json()


# --- auth -------------------------------------------------------------------

def test_endpoints_require_login(client):
    for path in ["/api/me", "/api/repos", "/api/sessions", "/api/stats"]:
        assert client.get(path).status_code == 401


def test_tampered_cookie_is_rejected(client):
    client.cookies.set(auth.SESSION_COOKIE, "not-a-jwt")
    assert client.get("/api/me").status_code == 401


def test_dev_login_and_logout(alice):
    assert alice.get("/api/me").json()["login"] == "dev-alice"
    alice.post("/api/auth/logout")
    assert alice.get("/api/me").status_code == 401


def test_github_callback_creates_user_and_checks_state(client, monkeypatch):
    monkeypatch.setattr(auth, "exchange_code", lambda code: "tok")
    monkeypatch.setattr(auth, "fetch_github_user",
                        lambda tok: {"id": 42, "login": "octo", "name": "Octo Cat", "avatar_url": "https://x/a.png"})
    r = client.get("/api/auth/github/login", follow_redirects=False)
    assert r.status_code == 307 and "github.com/login/oauth/authorize" in r.headers["location"]
    state = client.cookies.get(auth.STATE_COOKIE)

    bad = client.get("/api/auth/github/callback", params={"code": "c", "state": "wrong"}, follow_redirects=False)
    assert bad.status_code == 400

    ok = client.get("/api/auth/github/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert ok.status_code == 307 and ok.headers["location"].endswith("/dashboard")
    assert client.get("/api/me").json()["login"] == "octo"


# --- repos + ingest ---------------------------------------------------------

def test_add_repo_runs_ingest_to_ready(alice):
    repo = add_and_ingest(alice)
    assert repo["status"] == "ready" and repo["progress"] == 100
    assert repo["file_count"] == 2 and repo["languages"] == {"Python": 1, "JavaScript": 1}
    qs = alice.get(f"/api/repos/{repo['id']}/questions").json()
    assert len(qs) >= 3
    tied = [q for q in qs if q["path"]]
    assert tied and all(q["start_line"] <= q["end_line"] for q in tied)
    detail = alice.get(f"/api/questions/{tied[0]['id']}").json()
    assert detail["chunk"]["content"] and detail["reference_answer"]


def test_bad_url_duplicate_and_rate_limit(alice):
    assert alice.post("/api/repos", json={"url": "not a repo"}).status_code == 422
    assert alice.post("/api/repos", json={"url": "a/b"}).status_code == 201
    assert alice.post("/api/repos", json={"url": "https://github.com/A/B"}).status_code == 409
    for i in range(get_settings().repos_per_day - 1):
        assert alice.post("/api/repos", json={"url": f"a/r{i}"}).status_code == 201
    assert alice.post("/api/repos", json={"url": "a/one-too-many"}).status_code == 429


def test_users_cannot_see_each_others_data(alice):
    repo = add_and_ingest(alice)
    q = alice.get(f"/api/repos/{repo['id']}/questions").json()[0]
    s = alice.post("/api/sessions", json={"repo_id": repo["id"]}).json()
    with TestClient(app) as bob:
        login(bob, "bob")
        assert bob.get("/api/repos").json() == []
        for path in [f"/api/repos/{repo['id']}", f"/api/repos/{repo['id']}/questions",
                     f"/api/questions/{q['id']}", f"/api/sessions/{s['id']}"]:
            assert bob.get(path).status_code == 404, path
        assert bob.delete(f"/api/repos/{repo['id']}").status_code == 404
        assert bob.post("/api/sessions", json={"repo_id": repo["id"]}).status_code == 404


def test_user_error_fails_without_retry_then_manual_retry(alice):
    def missing(owner, name):
        raise RepoError("x/y not found")
    repo = add_and_ingest(alice, fetch=missing)
    assert repo["status"] == "failed" and "not found" in repo["error"]
    assert not worker.work_once(fetch=fake_fetch)  # nothing re-queued automatically
    assert alice.post(f"/api/repos/{repo['id']}/retry").status_code == 200
    assert worker.work_once(fetch=fake_fetch)
    assert alice.get(f"/api/repos/{repo['id']}").json()["status"] == "ready"


def test_transient_error_retries_up_to_three_times(alice):
    def flaky(owner, name):
        raise ConnectionError("GitHub down")
    rid = alice.post("/api/repos", json={"url": "a/flaky"}).json()["id"]
    for _ in range(3):
        assert worker.work_once(fetch=flaky)
    assert not worker.work_once(fetch=flaky)
    with SessionLocal() as db:
        job = db.query(Job).filter_by(repo_id=rid).one()
        assert job.status == "failed" and job.attempts == 3
        assert db.get(Repo, rid).status == "failed"


def test_retry_does_not_duplicate_chunks(alice):
    repo = add_and_ingest(alice)
    with SessionLocal() as db:
        r = db.get(Repo, repo["id"])
        r.status = "failed"
        db.commit()
    alice.post(f"/api/repos/{repo['id']}/retry")
    worker.work_once(fetch=fake_fetch)
    again = alice.get(f"/api/repos/{repo['id']}").json()
    assert again["chunk_count"] == repo["chunk_count"]
    assert again["question_count"] == repo["question_count"]


def test_stale_running_job_is_recovered(alice):
    from datetime import datetime, timedelta, timezone
    rid = alice.post("/api/repos", json={"url": "a/stale"}).json()["id"]
    with SessionLocal() as db:
        job = db.query(Job).filter_by(repo_id=rid).one()
        job.status, job.started_at = "running", datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
        assert worker.recover_stale(db) == 1
    assert worker.work_once(fetch=fake_fetch)


# --- interviews -------------------------------------------------------------

def test_full_interview_flow_and_stats(alice):
    repo = add_and_ingest(alice)
    assert alice.post("/api/sessions", json={"repo_id": repo["id"], "count": 3}).status_code == 201
    s = alice.get("/api/sessions").json()[0]
    s = alice.get(f"/api/sessions/{s['id']}").json()
    assert s["total"] == 3 and s["status"] == "active"
    assert all(a["reference_answer"] is None for a in s["answers"])  # not open-book
    order = [a["question"]["difficulty"] for a in s["answers"]]
    assert order == sorted(order, key=["easy", "medium", "hard"].index)

    first = s["answers"][0]
    r = alice.post(f"/api/sessions/{s['id']}/answers/{first['id']}", json={"text": "It reads the inputs and returns."})
    assert r.status_code == 200
    graded = r.json()["answers"][0]
    assert 0 <= graded["score"] <= 10 and graded["feedback"] and graded["reference_answer"]
    assert alice.post(f"/api/sessions/{s['id']}/answers/{first['id']}", json={"text": "again"}).status_code == 409

    for a in s["answers"][1:]:
        alice.post(f"/api/sessions/{s['id']}/answers/{a['id']}", json={"text": "I would add caching."})
    done = alice.get(f"/api/sessions/{s['id']}").json()
    assert done["status"] == "completed" and done["answered"] == 3

    st = alice.get("/api/stats").json()
    assert st["sessions"] == 1 and st["answers"] == 3 and st["average"] is not None
    assert st["by_topic"] == sorted(st["by_topic"], key=lambda t: t["average"])  # weakest first
    assert st["by_repo"][0]["name"] == "techi101/demo"


def test_new_session_prefers_unseen_questions(alice):
    repo = add_and_ingest(alice)
    total = repo["question_count"]
    first = alice.post("/api/sessions", json={"repo_id": repo["id"], "count": 3}).json()
    second = alice.post("/api/sessions", json={"repo_id": repo["id"], "count": 3}).json()
    ids1 = {a["question"]["id"] for a in first["answers"]}
    ids2 = {a["question"]["id"] for a in second["answers"]}
    if total >= 6:
        assert not ids1 & ids2


def test_cannot_interview_on_unready_repo(alice):
    rid = alice.post("/api/repos", json={"url": "a/pending"}).json()["id"]
    assert alice.post("/api/sessions", json={"repo_id": rid}).status_code == 409


def test_grader_failure_does_not_use_up_the_answer(alice, monkeypatch):
    from app.routers import sessions as sessions_mod
    from app.services.llm import LLMError

    class Broken:
        def grade(self, *a):
            raise LLMError("Groq HTTP 503")

    repo = add_and_ingest(alice)
    s = alice.post("/api/sessions", json={"repo_id": repo["id"], "count": 1}).json()
    aid = s["answers"][0]["id"]
    monkeypatch.setattr(sessions_mod, "get_llm", lambda: Broken())
    assert alice.post(f"/api/sessions/{s['id']}/answers/{aid}", json={"text": "x"}).status_code == 502
    monkeypatch.undo()
    assert alice.post(f"/api/sessions/{s['id']}/answers/{aid}", json={"text": "x"}).status_code == 200


def test_delete_repo_cascades(alice):
    repo = add_and_ingest(alice)
    alice.post("/api/sessions", json={"repo_id": repo["id"]})
    assert alice.delete(f"/api/repos/{repo['id']}").status_code == 204
    assert alice.get("/api/repos").json() == [] and alice.get("/api/sessions").json() == []


def test_two_workers_never_claim_the_same_job(alice):
    """Postgres only: SKIP LOCKED lets concurrent claimers take different rows."""
    import pytest
    from app.db import engine
    if engine.dialect.name != "postgresql":
        pytest.skip("row locks need Postgres")
    for i in range(2):
        alice.post("/api/repos", json={"url": f"a/c{i}"})
    from sqlalchemy import select
    with SessionLocal() as a, SessionLocal() as b:
        # a locks the first queued row and holds the transaction open...
        q = select(Job).where(Job.status == "queued").order_by(Job.id).limit(1).with_for_update(skip_locked=True)
        held = a.scalars(q).first()
        # ...so b, claiming at the same moment, must skip it rather than wait or duplicate.
        got = worker.claim_next(b)
        assert got is not None and got.id != held.id
        a.rollback()
