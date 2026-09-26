import pytest

from app.services.chunker import chunk_file, pick_for_questions
from app.services.github import RepoError, SourceFile, _looks_generated, parse_repo_url, select_paths

from .conftest import SAMPLE_JS, SAMPLE_PY


@pytest.mark.parametrize("raw", [
    "techi101/rag-project",
    "github.com/techi101/rag-project",
    "https://github.com/techi101/rag-project",
    "https://github.com/techi101/rag-project.git",
    "https://github.com/techi101/rag-project/tree/main/eval",
    "  https://www.github.com/techi101/rag-project/  ",
])
def test_parse_repo_url_accepts_common_forms(raw):
    assert parse_repo_url(raw) == ("techi101", "rag-project")


@pytest.mark.parametrize("raw", ["", "rag-project", "https://gitlab.com/a", "a b/c", "owner/.."])
def test_parse_repo_url_rejects_garbage(raw):
    with pytest.raises(RepoError):
        parse_repo_url(raw)


def test_select_paths_filters_before_download():
    tree = [
        {"type": "blob", "path": "README.md", "size": 10},
        {"type": "blob", "path": "src/app.py", "size": 100},
        {"type": "blob", "path": "node_modules/lib/index.js", "size": 10},
        {"type": "blob", "path": ".github/workflows/x.py", "size": 10},
        {"type": "blob", "path": "static/bundle.min.js", "size": 10},
        {"type": "blob", "path": "yolov8n.pt", "size": 6_000_000},
        {"type": "blob", "path": "static/models/yolov8n.onnx", "size": 12_000_000},
        {"type": "blob", "path": "data/huge.py", "size": 5_000_000},
        {"type": "blob", "path": "docs/notes.txt", "size": 10},
        {"type": "tree", "path": "web", "size": 0},
        {"type": "blob", "path": "web/ui.tsx", "size": 50},
        {"type": "blob", "path": "docs/README.md", "size": 10},  # not the root README
    ]
    paths, readme = select_paths(tree)
    assert readme == "README.md"
    assert paths == ["src/app.py", "web/ui.tsx"]


def test_minified_text_is_detected():
    assert _looks_generated("x" * 2000)
    assert not _looks_generated("def f():\n    return 1\n")


def test_python_chunks_are_exact_functions_and_classes():
    chunks = chunk_file(SourceFile("orders.py", "Python", SAMPLE_PY))
    by_symbol = {c.symbol: c for c in chunks}
    assert set(by_symbol) == {"load_orders", "Cart"}
    lo = by_symbol["load_orders"]
    assert lo.kind == "function" and lo.content.startswith("def load_orders")
    lines = SAMPLE_PY.splitlines()
    assert lines[lo.start_line - 1].startswith("def load_orders")
    assert lines[lo.end_line - 1].strip() == "return out"


def test_big_python_class_is_split_into_methods():
    methods = "\n".join(f"    def m{i}(self):\n" + "        x = 1\n" * 10 for i in range(20))
    src = "class Big:\n" + methods
    chunks = chunk_file(SourceFile("big.py", "Python", src))
    assert {c.symbol for c in chunks} == {f"Big.m{i}" for i in range(20)}


def test_decorators_are_part_of_the_function():
    src = "@app.get('/x')\n@cache\ndef handler():\n    a = 1\n    b = 2\n    return a + b\n"
    (c,) = chunk_file(SourceFile("h.py", "Python", src))
    assert c.start_line == 1 and c.content.startswith("@app.get")


def test_heuristic_chunker_for_javascript():
    chunks = chunk_file(SourceFile("user.js", "JavaScript", SAMPLE_JS))
    assert any(c.symbol == "fetchUser" and c.kind == "function" for c in chunks)


def test_python_syntax_error_falls_back_to_heuristic():
    src = "def broken(:\n    pass\n    pass\n    pass\n    pass\n"
    chunks = chunk_file(SourceFile("b.py", "Python", src))
    assert chunks and chunks[0].symbol == "broken"


def test_long_block_is_windowed():
    src = "\n".join(f"x{i} = {i}" for i in range(400))
    chunks = chunk_file(SourceFile("data.py", "Python", "def big():\n" + "\n".join("    " + l for l in src.splitlines())))
    assert len(chunks) >= 3
    assert all(c.end_line - c.start_line + 1 <= 150 for c in chunks)


def test_pick_limits_per_file_and_skips_tests():
    code = "def f(x):\n" + "    if x:\n        for i in x:\n            try:\n                pass\n            except E:\n                raise\n" * 5
    files = [SourceFile(f"m{i}.py", "Python", code.replace("def f", f"def f{j}") * 1) for i in range(3) for j in range(1)]
    chunks = [c for f in files for c in chunk_file(f)]
    chunks += chunk_file(SourceFile("tests/test_m.py", "Python", code))
    picked = pick_for_questions(chunks, 10, per_file=1)
    assert len({c.path for c in picked}) == len(picked)
    assert picked[-1].path == "tests/test_m.py"  # tests rank last


WRAPPED_JS = '''document.addEventListener("DOMContentLoaded", () => {
    const MODEL_URLS = ["/a", "/b"];

    /** Download the model, trying each URL in turn. */
    async function fetchModel() {
        for (const url of MODEL_URLS) {
            try {
                return await fetch(url);
            } catch (e) {
                continue;
            }
        }
        throw new Error("all failed");
    }

    // Draw one frame.
    function draw(ctx) {
        if (!ctx) return;
        ctx.fillRect(0, 0, 1, 1);
        ctx.stroke();
    }
});
'''


def test_heuristic_finds_functions_inside_a_wrapper_with_their_doc_comment():
    chunks = chunk_file(SourceFile("static/script.js", "JavaScript", WRAPPED_JS))
    by = {c.symbol: c for c in chunks}
    assert {"fetchModel", "draw"} <= set(by)
    assert by["fetchModel"].content.lstrip().startswith("/** Download")
    assert "Draw one frame" not in by["fetchModel"].content  # belongs to draw
    assert by["draw"].content.lstrip().startswith("// Draw one frame")


def test_topics_are_normalised_and_text_is_ascii():
    from app.services.llm import GeneratedQuestion, normalize_topic
    assert normalize_topic("Error Handling") == "error handling"
    assert normalize_topic("letterbox handling") == "implementation"
    assert normalize_topic("deployment trade‑offs") == "deployment"
    assert normalize_topic("non‑maximum suppression (NMS)") == "algorithms"
    q = GeneratedQuestion(question="Why the warm‑up loop?", reference_answer="It primes the model—once.")
    assert q.question == "Why the warm-up loop?" and "—" not in q.reference_answer
