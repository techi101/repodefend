import json

import httpx
import pytest

from app.services import llm as llm_mod
from app.services.llm import FakeLLM, GeneratedQuestion, Grade, GroqLLM, LLMError


def test_grade_score_is_clamped():
    assert Grade(score=14, feedback="x").score == 10
    assert Grade(score=-3, feedback="x").score == 0
    assert Grade(score="7.6", feedback="x").score == 8


def test_question_difficulty_is_normalised():
    q = GeneratedQuestion(question="Why a dict here?", difficulty="HARD ", topic=" Design",
                          reference_answer="Because lookups are O(1).")
    assert q.difficulty == "hard" and q.topic == "design"
    assert GeneratedQuestion(question="Why a dict here?", difficulty="extreme",
                             reference_answer="Because lookups are O(1).").difficulty == "medium"


def test_fake_grader_rewards_overlap():
    f = FakeLLM()
    ref = "It validates quantity, raises ValueError for non-positive values, then increments the count."
    good = f.grade("q", ref, "", "It validates the quantity and raises ValueError, then increments the count")
    bad = f.grade("q", ref, "", "no idea")
    assert good.score > bad.score


def _response(status, body=None, headers=None):
    return httpx.Response(status, json=body, headers=headers or {},
                          request=httpx.Request("POST", GroqLLM.URL))


def test_groq_retries_on_429_then_succeeds(monkeypatch):
    content = json.dumps({"score": 8, "feedback": "Solid.", "missed": []})
    calls = iter([_response(429, {"error": "slow down"}, {"retry-after": "0"}),
                  _response(200, {"choices": [{"message": {"content": content}}]})])
    monkeypatch.setattr(llm_mod.httpx, "post", lambda *a, **k: next(calls))
    monkeypatch.setattr(llm_mod.time, "sleep", lambda s: None)
    g = GroqLLM("key", "model").grade("q", "ref", "code", "answer")
    assert g.score == 8


def test_groq_drops_malformed_questions_but_keeps_good_ones(monkeypatch):
    content = json.dumps({"questions": [
        {"question": "Why does load_orders skip rows without an id?", "topic": "data", "difficulty": "easy",
         "reference_answer": "Rows without an id cannot be referenced later, so they are dropped."},
        {"question": "short"},  # invalid: too short, no reference answer
    ]})
    monkeypatch.setattr(llm_mod.httpx, "post",
                        lambda *a, **k: _response(200, {"choices": [{"message": {"content": content}}]}))
    qs = GroqLLM("key", "model").questions_for_chunk("r", "p.py", "f", "code", 2)
    assert len(qs) == 1


def test_groq_client_error_is_not_retried(monkeypatch):
    calls = []
    monkeypatch.setattr(llm_mod.httpx, "post", lambda *a, **k: calls.append(1) or _response(401, {"error": "bad key"}))
    with pytest.raises(LLMError):
        GroqLLM("key", "model").grade("q", "r", "c", "a")
    assert len(calls) == 1


def test_missing_key_is_a_clear_error():
    with pytest.raises(LLMError, match="GROQ_API_KEY"):
        GroqLLM("", "model")


def test_groq_waits_out_many_rate_limits(monkeypatch):
    content = json.dumps({"score": 5, "feedback": "Partly.", "missed": []})
    replies = [_response(429, {"error": "tpm"}, {"retry-after": "3"})] * 6
    replies.append(_response(200, {"choices": [{"message": {"content": content}}]}))
    calls, sleeps = iter(replies), []
    monkeypatch.setattr(llm_mod.httpx, "post", lambda *a, **k: next(calls))
    monkeypatch.setattr(llm_mod.time, "sleep", sleeps.append)
    assert GroqLLM("key", "openai/gpt-oss-120b").grade("q", "r", "c", "a").score == 5
    assert sleeps == [3.0] * 6


def test_groq_gives_up_on_endless_rate_limits(monkeypatch):
    monkeypatch.setattr(llm_mod.httpx, "post", lambda *a, **k: _response(429, {}, {"retry-after": "1"}))
    monkeypatch.setattr(llm_mod.time, "sleep", lambda s: None)
    with pytest.raises(LLMError, match="rate limit"):
        GroqLLM("key", "m").grade("q", "r", "c", "a")
