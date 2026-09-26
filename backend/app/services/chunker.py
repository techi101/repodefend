"""Split source files into chunks an interviewer could ask about, and rank them.

Python is parsed properly with the standard-library `ast` module, so a chunk is
exactly one function or class. Other languages use a line heuristic: a new
chunk starts at an unindented line that looks like a declaration. That is
approximate (it can miss methods nested inside classes) and the README says so.
"""
import ast
import re
from dataclasses import dataclass

from .github import SourceFile

MAX_CHUNK_LINES = 150
WINDOW_LINES = 80
MIN_CHUNK_LINES = 4

DECL_RE = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:function\b|class\b|interface\b|enum\b|struct\b|impl\b|func\b|fn\b|pub\s|def\b|"
    r"(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function|\w+\s*=>)|"
    r"(?:public|private|protected|static|abstract|final)\b|"
    r"create\s+(?:or\s+replace\s+)?(?:table|view|function|procedure|trigger)\b)",
    re.IGNORECASE,
)
# C, C++, Java-style function signature at column 0: "int main(void) {"
C_SIG_RE = re.compile(r"^[A-Za-z_][\w<>\[\],\*&:\s]*\s+\**[A-Za-z_]\w*\s*\([^;]*$")
NAME_RE = re.compile(
    r"(?:function|class|interface|enum|struct|impl|func|fn|def|const|let|var|table|view|procedure)\s+\**([A-Za-z_]\w*)",
    re.IGNORECASE,
)
BRANCH_RE = re.compile(r"\b(if|elif|else|for|while|try|except|catch|finally|switch|case|match|with|await|yield|raise|throw)\b")


@dataclass
class Chunk:
    path: str
    language: str
    kind: str
    symbol: str | None
    start_line: int  # 1-based, inclusive
    end_line: int
    content: str
    score: float = 0.0


def _slice(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1:end])


def _windows(f: SourceFile, lines: list[str], start: int, end: int, kind: str, symbol: str | None) -> list[Chunk]:
    """Break an over-long span into ~80-line pieces, cutting at blank lines where possible."""
    if end - start + 1 <= MAX_CHUNK_LINES:
        return [Chunk(f.path, f.language, kind, symbol, start, end, _slice(lines, start, end))]
    out, s = [], start
    while s <= end:
        e = min(s + WINDOW_LINES - 1, end)
        if e < end:  # back up to the last blank line in the second half of the window
            for i in range(e, s + WINDOW_LINES // 2, -1):
                if not lines[i - 1].strip():
                    e = i
                    break
        out.append(Chunk(f.path, f.language, "block", symbol, s, e, _slice(lines, s, e)))
        s = e + 1
    return out


def _chunk_python(f: SourceFile, lines: list[str]) -> list[Chunk] | None:
    try:
        tree = ast.parse(f.text)
    except SyntaxError:
        return None  # fall back to the line heuristic

    def span(node) -> tuple[int, int]:
        start = min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])])
        return start, node.end_lineno

    chunks: list[Chunk] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            s, e = span(node)
            chunks += _windows(f, lines, s, e, "function", node.name)
        elif isinstance(node, ast.ClassDef):
            s, e = span(node)
            if e - s + 1 <= MAX_CHUNK_LINES:
                chunks.append(Chunk(f.path, f.language, "class", node.name, s, e, _slice(lines, s, e)))
                continue
            # Big class: one chunk per method, so questions stay specific.
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    ms, me = span(sub)
                    chunks += _windows(f, lines, ms, me, "function", f"{node.name}.{sub.name}")
    return chunks


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" \t"))


def _is_comment(line: str) -> bool:
    return line.lstrip().startswith(("/*", "*", "//", "#", "--"))


def _chunk_heuristic(f: SourceFile, lines: list[str]) -> list[Chunk]:
    # Declarations at the *shallowest* indentation they appear at. Usually that is
    # column 0; in a file wrapped in `document.addEventListener(..., () => { ... })`
    # it is one level in, and those inner functions are what matter.
    decls = [(i, _indent(l)) for i, l in enumerate(lines, 1)
             if l.strip() and _indent(l) <= 8 and (DECL_RE.match(l.lstrip()) or C_SIG_RE.match(l.lstrip()))]
    if not decls:
        return _windows(f, lines, 1, len(lines), "block", _first_name("\n".join(lines)))
    level = min(ind for _, ind in decls)
    starts = [i for i, ind in decls if ind == level]
    # Pull each start up over the doc comment right above it.
    for k, s in enumerate(starts):
        floor = starts[k - 1] + 1 if k else 1
        while s > floor and _is_comment(lines[s - 2]):
            s -= 1
        starts[k] = s
    chunks: list[Chunk] = []
    bounds = starts + [len(lines) + 1]
    for s, nxt in zip(bounds, bounds[1:]):
        e = nxt - 1
        while e > s and (not lines[e - 1].strip() or _is_comment(lines[e - 1])):
            e -= 1  # trim trailing blanks, and the next chunk's leading comment
        body = _slice(lines, s, e)
        decl = next((l for l in lines[s - 1:e] if not _is_comment(l) and l.strip()), "")
        kind = "class" if re.search(r"\b(class|struct|interface)\b", decl) else "function"
        chunks += _windows(f, lines, s, e, kind, _first_name(decl) or _first_name(body))
    return chunks


def _first_name(text: str) -> str | None:
    m = NAME_RE.search(text)
    return m.group(1) if m else None


def chunk_file(f: SourceFile) -> list[Chunk]:
    lines = f.text.splitlines()
    if not lines:
        return []
    chunks = _chunk_python(f, lines) if f.language == "Python" else None
    if chunks is None:
        chunks = _chunk_heuristic(f, lines)
    chunks = [c for c in chunks if c.end_line - c.start_line + 1 >= MIN_CHUNK_LINES]
    for c in chunks:
        c.score = score_chunk(c)
    return chunks


def score_chunk(c: Chunk) -> float:
    """0..1: how much an interviewer could dig into this chunk.

    Length and branching (if/for/try/...) both count; tests and tiny helpers don't.
    """
    n = c.end_line - c.start_line + 1
    branches = len(BRANCH_RE.findall(c.content))
    score = 0.5 * min(n, 100) / 100 + 0.5 * min(branches, 15) / 15
    low = c.path.lower()
    if "test" in low or "spec" in low:
        score *= 0.3
    if c.symbol and c.symbol.startswith("_") and not c.symbol.startswith("__"):
        score *= 0.9  # private helpers are fair game, just less central
    return round(score, 4)


def pick_for_questions(chunks: list[Chunk], n: int, per_file: int = 2) -> list[Chunk]:
    """Top-scoring chunks, at most `per_file` from any one file, so questions cover the repo."""
    picked, per = [], {}
    for c in sorted(chunks, key=lambda c: c.score, reverse=True):
        if per.get(c.path, 0) >= per_file or c.score < 0.15:
            continue
        picked.append(c)
        per[c.path] = per.get(c.path, 0) + 1
        if len(picked) == n:
            break
    return picked
