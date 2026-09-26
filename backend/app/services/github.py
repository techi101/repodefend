"""Fetch a public GitHub repo and pull out the source files worth reading.

1. One API call lists every file in the repo with its size (the git "tree").
2. Paths are filtered *before* downloading: no node_modules, no model weights,
   no images. A repo with 11 MB of .pt/.onnx files costs nothing extra.
3. The survivors are fetched in parallel from raw.githubusercontent.com, which
   does not count against the 60-requests/hour API limit.
Files are held in memory and never written to disk.
"""
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import PurePosixPath

import httpx

from ..config import get_settings

LANGUAGES = {
    ".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".java": "Java", ".go": "Go",
    ".rs": "Rust", ".c": "C", ".h": "C", ".cpp": "C++", ".cc": "C++", ".hpp": "C++",
    ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".kt": "Kotlin", ".swift": "Swift",
    ".scala": "Scala", ".sql": "SQL",
}
SKIP_DIRS = {
    "node_modules", ".git", "venv", ".venv", "env", "__pycache__", "dist", "build",
    ".next", "out", "target", "vendor", "coverage", ".idea", ".vscode", "site-packages",
    "migrations", "third_party", "bower_components", ".tox", ".mypy_cache",
}
URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?(?:github\.com/)?([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:/.*)?$"
)


class RepoError(Exception):
    """A problem the user can fix (bad URL, private repo, too big)."""


@dataclass
class SourceFile:
    path: str
    language: str
    text: str


def parse_repo_url(raw: str) -> tuple[str, str]:
    """Accept 'owner/name', 'github.com/owner/name', full URLs, .git and /tree/... suffixes."""
    m = URL_RE.match(raw.strip().rstrip("/"))
    if not m:
        raise RepoError("That doesn't look like a GitHub repo. Try https://github.com/owner/name")
    owner, name = m.group(1), m.group(2)
    if name in {".", ".."}:
        raise RepoError("Invalid repo name")
    return owner, name


def _headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "repodefend"}
    if token := get_settings().github_token:
        h["Authorization"] = f"Bearer {token}"
    return h


def fetch_metadata(owner: str, name: str) -> dict:
    r = httpx.get(f"https://api.github.com/repos/{owner}/{name}", headers=_headers(), timeout=20)
    if r.status_code == 404:
        raise RepoError(f"{owner}/{name} not found. Only public repos are supported.")
    if r.status_code == 403 and r.headers.get("x-ratelimit-remaining") == "0":
        raise RepoError("GitHub rate limit reached on the server; try again in a few minutes.")
    r.raise_for_status()
    meta = r.json()
    if meta.get("private"):
        raise RepoError("Private repos are not supported yet.")
    if meta.get("size", 0) > get_settings().max_repo_kb:
        raise RepoError(f"Repo is {meta['size'] // 1000} MB; the limit is {get_settings().max_repo_kb // 1000} MB.")
    return meta


def head_sha(owner: str, name: str, branch: str) -> str:
    r = httpx.get(f"https://api.github.com/repos/{owner}/{name}/commits/{branch}",
                  headers={**_headers(), "Accept": "application/vnd.github.sha"}, timeout=20)
    r.raise_for_status()
    return r.text.strip()


def keep_path(path: str, size: int) -> str | None:
    """'readme', 'source', or None (skip). Same rules for every fetch method."""
    s = get_settings()
    parts = PurePosixPath(path).parts
    if not parts or size > s.max_file_kb * 1024:
        return None
    if any(p in SKIP_DIRS or p.startswith(".") for p in parts[:-1]):
        return None
    fname = parts[-1].lower()
    if len(parts) == 1 and fname.startswith("readme"):
        return "readme"
    ext = PurePosixPath(fname).suffix
    if ext not in LANGUAGES or fname.endswith((".min.js", ".d.ts")):
        return None
    return "source"


def _looks_generated(text: str) -> bool:
    lines = text.splitlines() or [""]
    # Minified bundles: a few enormous lines.
    return max(len(l) for l in lines) > 1000 or "@generated" in text[:500]


def select_paths(tree: list[dict]) -> tuple[list[str], str | None]:
    """From git tree entries, pick source paths (capped) and the README path."""
    sources, readme = [], None
    for e in tree:
        if e.get("type") != "blob":
            continue
        kind = keep_path(e["path"], e.get("size", 0))
        if kind == "readme" and readme is None:
            readme = e["path"]
        elif kind == "source":
            sources.append(e["path"])
    sources.sort()
    return sources[: get_settings().max_files], readme


def fetch_sources(owner: str, name: str, ref: str) -> tuple[list[SourceFile], str | None]:
    r = httpx.get(f"https://api.github.com/repos/{owner}/{name}/git/trees/{ref}",
                  params={"recursive": "1"}, headers=_headers(), timeout=30)
    r.raise_for_status()
    paths, readme_path = select_paths(r.json().get("tree", []))

    def get(path: str) -> str | None:
        url = f"https://raw.githubusercontent.com/{owner}/{name}/{ref}/{path}"
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        return resp.text if resp.status_code == 200 else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        texts = list(pool.map(get, paths + ([readme_path] if readme_path else [])))
    readme = texts.pop() if readme_path else None
    files = [SourceFile(p, LANGUAGES[PurePosixPath(p.lower()).suffix], t)
             for p, t in zip(paths, texts) if t is not None and not _looks_generated(t)]
    return files, readme
