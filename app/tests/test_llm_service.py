from __future__ import annotations

from dataclasses import dataclass

import pytest

from app import llm_service


@dataclass
class FakeEvidence:
    block_id: str
    text: str
    page_number: int
    score: float
    cosine_score: float
    block_type: str
    source_type: str = "document_block"


class RecordingProvider:
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[dict] = []

    def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FailingProvider:
    def __init__(self, code: str) -> None:
        self.code = code

    def complete(self, **kwargs):
        raise llm_service.ProviderError(self.code, self.code)


def _set_llm_env(monkeypatch, **values):
    defaults = {
        "LLM_ENABLED": "1",
        "LLM_MODEL": "llama-3.3-70b-versatile",
        "LLM_TEMPERATURE": "0.1",
        "LLM_MAX_TOKENS": "1024",
        "LLM_TIMEOUT_SECONDS": "8",
        "LLM_MAX_EVIDENCE_BLOCKS": "4",
        "LLM_MAX_CHARS_PER_BLOCK": "120",
        "LLM_MAX_TOTAL_EVIDENCE_CHARS": "200",
        "LLM_CLARIFY_SCORE_THRESHOLD": "0.62",
        "LLM_CLARIFY_MARGIN": "0.04",
        "GROQ_API_KEY": "",
    }
    defaults.update(values)
    for key, value in defaults.items():
        monkeypatch.setenv(key, value)


def test_synthesize_answer_returns_raw_evidence_when_disabled(monkeypatch):
    _set_llm_env(monkeypatch, LLM_ENABLED="0")
    evidence = [
        FakeEvidence("block-1", "Primary answer", 2, 0.98, 0.94, "paragraph"),
    ]

    result = llm_service.synthesize_answer(query="What is revenue?", evidence=evidence)

    assert result["answer"] == "Primary answer"
    assert result["answer_source"] == "fallback:raw_evidence"
    assert result["llm_fallback_reason"] == "llm_disabled"
    assert result["llm_model"] is None


def test_synthesize_answer_returns_insufficient_evidence_message(monkeypatch):
    _set_llm_env(monkeypatch)

    result = llm_service.synthesize_answer(query="Tell me about dinosaurs", evidence=[])

    assert result["answer"].startswith(llm_service.INSUFFICIENT_EVIDENCE_MESSAGE)
    assert result["answer_source"] == "none:insufficient_evidence"


def test_synthesize_answer_returns_clarification_for_suspicious_year(monkeypatch):
    _set_llm_env(monkeypatch)

    result = llm_service.synthesize_answer(query="what is revenue for 20200", evidence=[])

    assert "2020" in result["answer"]
    assert result["answer_source"].startswith("clarification:")


def test_synthesize_answer_falls_back_when_provider_fails(monkeypatch):
    _set_llm_env(monkeypatch)
    evidence = [
        FakeEvidence("block-1", "Primary answer", 2, 0.98, 0.94, "paragraph"),
        FakeEvidence("block-2", "Secondary answer", 4, 0.91, 0.88, "table", source_type="document_table"),
    ]

    result = llm_service.synthesize_answer(
        query="What is the answer?",
        evidence=evidence,
        provider=FailingProvider("rate_limited"),
    )

    assert result["answer"] == "Primary answer"
    assert result["answer_source"] == "fallback:raw_evidence"
    assert result["llm_error_code"] == "rate_limited"
    assert result["llm_fallback_reason"] == "provider_failed"


def test_prompt_uses_rank_numbers_and_caps_total_context(monkeypatch):
    _set_llm_env(
        monkeypatch,
        LLM_MAX_EVIDENCE_BLOCKS="2",
        LLM_MAX_CHARS_PER_BLOCK="80",
        LLM_MAX_TOTAL_EVIDENCE_CHARS="120",
    )
    provider = RecordingProvider("Revenue was $5M [1]")
    evidence = [
        FakeEvidence("block-1", "Revenue was $5M.\n" * 20, 2, 0.98, 0.94, "paragraph"),
        FakeEvidence("block-2", "| Revenue | $5M |\n" * 20, 4, 0.91, 0.88, "table", source_type="document_table"),
        FakeEvidence("block-3", "Cash flow was $1M.\n" * 20, 5, 0.85, 0.83, "paragraph"),
    ]

    result = llm_service.synthesize_answer(
        query="What is revenue?",
        evidence=evidence,
        provider=provider,
    )

    assert result["answer"] == "Revenue was $5M [1]"
    assert result["answer_source"] == "groq:llama-3.3-70b-versatile"
    assert len(provider.calls) == 1
    prompt = provider.calls[0]["user_prompt"]
    assert "[1] (Page 2, paragraph" in prompt
    assert "[2] (Page 4, table" in prompt
    assert "[3]" not in prompt
    assert "...[truncated]" in prompt


@pytest.mark.skipif(
    not llm_service._env_flag("RUN_GROQ_INTEGRATION_TESTS", False),
    reason="Set RUN_GROQ_INTEGRATION_TESTS=1 to run Groq integration tests.",
)
def test_groq_integration_smoke(monkeypatch):
    groq_api_key = llm_service.os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_api_key:
        pytest.skip("GROQ_API_KEY is not configured.")

    _set_llm_env(monkeypatch, GROQ_API_KEY=groq_api_key)
    evidence = [
        FakeEvidence("block-1", "Revenue was $5M in 2024.", 2, 0.98, 0.94, "paragraph"),
        FakeEvidence("block-2", "EBITDA was $2M in 2024.", 3, 0.94, 0.90, "paragraph"),
    ]

    result = llm_service.synthesize_answer(query="What was revenue?", evidence=evidence)

    assert result["answer_source"] == "groq:llama-3.3-70b-versatile"
    assert "[1]" in result["answer"]
