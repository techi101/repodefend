import os
import tempfile

# Settings are read at import time, so configure before importing the app.
_tmp = tempfile.mkdtemp()
os.environ.update({
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"),
    "LLM_PROVIDER": "fake",
    "RUN_WORKER": "false",
    "DEV_LOGIN": "true",
    "JWT_SECRET": "test-secret-that-is-at-least-32-bytes-long",
    "GITHUB_CLIENT_ID": "test-client",
    "GITHUB_CLIENT_SECRET": "test-secret",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.github import SourceFile  # noqa: E402

SAMPLE_PY = '''"""Order service."""
import json


def load_orders(path):
    """Read orders from a JSON file, skipping bad rows."""
    out = []
    with open(path) as f:
        for row in json.load(f):
            if not row.get("id"):
                continue
            try:
                row["total"] = float(row["total"])
            except (KeyError, ValueError):
                raise ValueError(f"bad total in {row}")
            out.append(row)
    return out


class Cart:
    def __init__(self):
        self.items = {}

    def add(self, sku, qty=1):
        if qty <= 0:
            raise ValueError("qty must be positive")
        self.items[sku] = self.items.get(sku, 0) + qty

    def total(self, prices):
        return sum(prices[s] * q for s, q in self.items.items() if s in prices)
'''

SAMPLE_JS = '''import express from "express";

export async function fetchUser(id) {
  if (!id) throw new Error("id required");
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) {
    throw new Error("failed");
  }
  return res.json();
}

const app = express();
app.get("/", (req, res) => res.send("ok"));
'''


def fake_fetch(owner, name):
    files = [SourceFile("orders.py", "Python", SAMPLE_PY), SourceFile("web/user.js", "JavaScript", SAMPLE_JS)]
    return {"default_branch": "main", "description": "demo repo"}, files, "# Demo\nA demo."


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client, name="alice"):
    r = client.post("/api/auth/dev-login", json={"login": name})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def alice(client):
    return login(client, "alice")
