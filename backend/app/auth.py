"""Login: GitHub OAuth, a dev-only shortcut, and the session cookie.

The session is a signed JWT in an httpOnly cookie. httpOnly means page JavaScript
cannot read it, so an XSS bug cannot steal the session. The frontend reaches the
API through its own /api/* proxy, so the cookie is first-party and SameSite=Lax
is enough to block cross-site request forgery on POST/DELETE.
"""
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

SESSION_COOKIE = "rd_session"
STATE_COOKIE = "rd_oauth_state"

router = APIRouter(prefix="/api/auth", tags=["auth"])


# --- session cookie ---------------------------------------------------------

def issue_session(response: Response, user: User) -> None:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(days=s.session_days)
    token = jwt.encode({"sub": str(user.id), "exp": exp}, s.jwt_secret, algorithm="HS256")
    response.set_cookie(
        SESSION_COOKIE, token, max_age=s.session_days * 86400,
        httponly=True, secure=s.cookie_secure, samesite="lax", path="/",
    )


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Not signed in")
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired or invalid")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(401, "User no longer exists")
    return user


# --- GitHub OAuth -----------------------------------------------------------

def _callback_url() -> str:
    # GitHub redirects the browser to the *frontend* origin; its /api proxy
    # forwards to us. That keeps the cookie we set first-party.
    return get_settings().frontend_url.rstrip("/") + "/api/auth/github/callback"


def exchange_code(code: str) -> str:
    """Trade the one-time OAuth code for an access token."""
    s = get_settings()
    r = httpx.post(
        "https://github.com/login/oauth/access_token",
        data={"client_id": s.github_client_id, "client_secret": s.github_client_secret,
              "code": code, "redirect_uri": _callback_url()},
        headers={"Accept": "application/json"}, timeout=15,
    )
    r.raise_for_status()
    token = r.json().get("access_token")
    if not token:
        raise HTTPException(400, "GitHub rejected the login code")
    return token


def fetch_github_user(token: str) -> dict:
    r = httpx.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


@router.get("/github/login")
def github_login():
    s = get_settings()
    if not s.github_client_id:
        raise HTTPException(503, "GitHub login is not configured on this server")
    state = secrets.token_urlsafe(24)
    url = "https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": s.github_client_id, "redirect_uri": _callback_url(),
        "scope": "read:user", "state": state,
    })
    resp = RedirectResponse(url)
    # state ties the callback to this browser: stops an attacker logging you
    # into *their* account via a crafted callback link (login CSRF).
    resp.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True,
                    secure=s.cookie_secure, samesite="lax", path="/")
    return resp


@router.get("/github/callback")
def github_callback(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    expected = request.cookies.get(STATE_COOKIE)
    if not expected or not secrets.compare_digest(expected, state):
        raise HTTPException(400, "Login state mismatch; please try again")

    gh = fetch_github_user(exchange_code(code))  # the token is used once, never stored
    user = db.scalar(select(User).where(User.github_id == gh["id"]))
    if user is None:
        user = User(github_id=gh["id"], login=gh["login"])
        db.add(user)
    user.login, user.name, user.avatar_url = gh["login"], gh.get("name"), gh.get("avatar_url")
    db.commit()

    resp = RedirectResponse(get_settings().frontend_url.rstrip("/") + "/dashboard")
    resp.delete_cookie(STATE_COOKIE, path="/")
    issue_session(resp, user)
    return resp


# --- dev login + logout -----------------------------------------------------

class DevLogin(BaseModel):
    login: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9-]+$")


@router.post("/dev-login")
def dev_login(body: DevLogin, response: Response, db: Session = Depends(get_db)):
    if not get_settings().dev_login:
        raise HTTPException(404)
    login = f"dev-{body.login}"
    user = db.scalar(select(User).where(User.login == login))
    if user is None:
        user = User(login=login, name=body.login)
        db.add(user)
        db.commit()
    issue_session(response, user)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/config")
def auth_config():
    s = get_settings()
    return {"github": bool(s.github_client_id), "dev_login": s.dev_login}
