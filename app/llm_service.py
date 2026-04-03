from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Sequence

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("llm_service")

INSUFFICIENT_EVIDENCE_MESSAGE = "Insufficient evidence found in the uploaded document."

SYSTEM_PROMPT = """You are DocuMind, a document analysis assistant. You answer questions using ONLY the evidence provided below.

Follow these rules strictly:
1. Use ONLY information from the evidence blocks. Never use external knowledge.
2. Cite every factual claim with [1], [2], etc. matching the evidence block numbers exactly.
3. If the evidence is insufficient, say exactly: "Insufficient evidence found in the uploaded document."
4. For financial numbers, quote them exactly as they appear in the evidence.
5. Keep the answer concise: 2-4 sentences for simple questions, or a short structured answer for conflicts/comparisons.
6. If only part of the question is supported, answer only that part and explicitly note what remains unsupported.
7. If evidence conflicts, use this exact structure:
Interpretation 1: ... [1]
Interpretation 2: ... [2]
Most likely: ... [1][2]
8. If the evidence is ambiguous and the question itself is unclear, ask one concise follow-up question instead of guessing.
"""


class ProviderError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


class TextProvider(Protocol):
    def complete(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_completion_tokens: int,
        timeout_seconds: float,
    ) -> str:
        ...


@dataclass(frozen=True)
class LLMConfig:
    enabled: bool
    model: str
    temperature: float
    max_completion_tokens: int
    timeout_seconds: float
    max_evidence_blocks: int
    max_chars_per_block: int
    max_total_chars: int
    clarify_score_threshold: float
    clarify_margin: float


@dataclass(frozen=True)
class PreparedEvidence:
    citation_number: int
    page_number: int
    block_type: str
    source_type: str
    score: float
    text: str


def _env_flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def _load_config() -> LLMConfig:
    return LLMConfig(
        enabled=_env_flag("LLM_ENABLED", True),
        model=os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile",
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.1")),
        max_completion_tokens=int(os.environ.get("LLM_MAX_TOKENS", "1024")),
        timeout_seconds=float(os.environ.get("LLM_TIMEOUT_SECONDS", "8")),
        max_evidence_blocks=max(1, int(os.environ.get("LLM_MAX_EVIDENCE_BLOCKS", "4"))),
        max_chars_per_block=max(300, int(os.environ.get("LLM_MAX_CHARS_PER_BLOCK", "1800"))),
        max_total_chars=max(1000, int(os.environ.get("LLM_MAX_TOTAL_EVIDENCE_CHARS", "5000"))),
        clarify_score_threshold=float(os.environ.get("LLM_CLARIFY_SCORE_THRESHOLD", "0.62")),
        clarify_margin=float(os.environ.get("LLM_CLARIFY_MARGIN", "0.04")),
    )


def _metadata_from_config(config: LLMConfig) -> dict[str, Any]:
    return {
        "llm_enabled": config.enabled,
        "llm_model": config.model if config.enabled else None,
        "llm_available": config.enabled and bool(os.environ.get("GROQ_API_KEY", "").strip()),
        "llm_error_code": None,
        "llm_fallback_reason": None,
    }


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+\n", "\n", re.sub(r"\n{3,}", "\n\n", text.strip()))


def _truncate_text(text: str, limit: int) -> str:
    cleaned = _normalize_whitespace(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(0, limit - 16)].rstrip() + "\n...[truncated]"


def _suspicious_year_token(query: str) -> str | None:
    for token in re.findall(r"\b\d{5,}\b", query):
        if token.startswith(("19", "20")):
            shortened = token[:4]
            if 1900 <= int(shortened) <= 2099:
                return token
    return None


def _looks_unclear(query: str, evidence: Sequence[Any], config: LLMConfig) -> bool:
    suspicious_year = _suspicious_year_token(query)
    if suspicious_year:
        return True

    if not evidence:
        return False

    top_score = float(getattr(evidence[0], "score", 0.0) or 0.0)
    second_score = float(getattr(evidence[1], "score", 0.0) or 0.0) if len(evidence) > 1 else 0.0
    close_scores = abs(top_score - second_score) <= config.clarify_margin
    low_confidence = top_score < config.clarify_score_threshold
    source_types = {str(getattr(item, "source_type", "document_block")) for item in evidence[:3]}
    block_types = {str(getattr(item, "block_type", "paragraph")) for item in evidence[:3]}
    diversified = len(source_types) > 1 or len(block_types) > 1
    return low_confidence or (close_scores and diversified)


def _deterministic_clarification(query: str) -> str:
    suspicious_year = _suspicious_year_token(query)
    if suspicious_year:
        return f'Did you mean "{query.replace(suspicious_year, suspicious_year[:4], 1)}"?'
    return "Could you clarify the exact metric, year, or section you want me to answer from the document?"


def _build_reasoning_notes(query: str, evidence: Sequence[Any], config: LLMConfig) -> list[str]:
    notes: list[str] = []
    if not evidence:
        return notes

    top_score = float(getattr(evidence[0], "score", 0.0) or 0.0)
    if top_score < config.clarify_score_threshold:
        notes.append("Top evidence score is low, so the answer should stay conservative.")

    if len(evidence) > 1:
        second_score = float(getattr(evidence[1], "score", 0.0) or 0.0)
        if abs(top_score - second_score) <= config.clarify_margin:
            notes.append("The top two evidence blocks are close in score; treat the evidence as potentially ambiguous.")

    source_types = {str(getattr(item, "source_type", "document_block")) for item in evidence}
    if len(source_types) > 1:
        notes.append("Evidence spans multiple source types; mention any disagreements explicitly.")

    if _suspicious_year_token(query):
        notes.append("The query contains a suspicious year-like token; ask a clarification question if the answer would otherwise be speculative.")

    return notes


def _pick_evidence(evidence: Sequence[Any], config: LLMConfig) -> list[tuple[int, Any]]:
    if not evidence:
        return []

    ranked = list(enumerate(evidence, start=1))
    selected: list[tuple[int, Any]] = []
    seen_signatures: set[tuple[str, str]] = set()

    for citation_number, item in ranked:
        signature = (
            str(getattr(item, "source_type", "document_block")),
            str(getattr(item, "block_type", "paragraph")),
        )
        if signature in seen_signatures:
            continue
        selected.append((citation_number, item))
        seen_signatures.add(signature)
        if len(selected) >= config.max_evidence_blocks:
            return selected

    for citation_number, item in ranked:
        if len(selected) >= config.max_evidence_blocks:
            break
        if any(existing_number == citation_number for existing_number, _ in selected):
            continue
        selected.append((citation_number, item))

    return selected


def _prepare_evidence(evidence: Sequence[Any], config: LLMConfig) -> list[PreparedEvidence]:
    total_chars = 0
    prepared: list[PreparedEvidence] = []

    for citation_number, item in _pick_evidence(evidence, config):
        remaining = config.max_total_chars - total_chars
        if remaining <= 0:
            break

        text_limit = min(config.max_chars_per_block, remaining)
        text = _truncate_text(str(getattr(item, "text", "") or ""), text_limit)
        if not text:
            continue

        prepared.append(
            PreparedEvidence(
                citation_number=citation_number,
                page_number=int(getattr(item, "page_number", 0) or 0),
                block_type=str(getattr(item, "block_type", "paragraph") or "paragraph"),
                source_type=str(getattr(item, "source_type", "document_block") or "document_block"),
                score=float(getattr(item, "score", 0.0) or 0.0),
                text=text,
            )
        )
        total_chars += len(text)

    return prepared


def _format_evidence_for_prompt(prepared: Sequence[PreparedEvidence]) -> str:
    chunks = []
    for item in prepared:
        chunks.append(
            f"[{item.citation_number}] (Page {item.page_number}, {item.block_type}, source={item.source_type}, score={item.score:.3f})\n"
            f"{item.text}"
        )
    return "\n\n".join(chunks)


def _build_synthesis_prompt(query: str, prepared: Sequence[PreparedEvidence], notes: Sequence[str]) -> str:
    note_text = ""
    if notes:
        note_text = "Reasoning notes:\n- " + "\n- ".join(notes) + "\n\n"
    return (
        f'User question:\n{query}\n\n'
        f"{note_text}"
        "Evidence blocks:\n"
        f"{_format_evidence_for_prompt(prepared)}"
    )


def _build_clarification_prompt(query: str, evidence: Sequence[Any], notes: Sequence[str], fallback_question: str) -> str:
    prompt = [
        "The user question may be unclear or underspecified.",
        f"Question: {query}",
    ]
    if notes:
        prompt.append("Notes:\n- " + "\n- ".join(notes))
    if evidence:
        prepared = _prepare_evidence(evidence, _load_config())
        if prepared:
            prompt.append("Evidence:\n" + _format_evidence_for_prompt(prepared))
    prompt.append(
        "Write exactly one short clarification question. Do not answer the original question. "
        f"If you cannot improve on it, use this question verbatim: {fallback_question}"
    )
    return "\n\n".join(prompt)


def _extract_text_completion(response_text: str, fallback_question: str | None = None) -> str:
    text = _normalize_whitespace(response_text)
    if not text:
        return fallback_question or INSUFFICIENT_EVIDENCE_MESSAGE
    if fallback_question and not text.endswith("?"):
        return fallback_question
    return text


def _classify_provider_error(exc: Exception) -> str:
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return "rate_limited"
    if status_code == 401:
        return "unauthorized"
    if status_code and 500 <= int(status_code) < 600:
        return "provider_unavailable"

    name = exc.__class__.__name__.lower()
    if "timeout" in name:
        return "timeout"
    if "connection" in name or "connect" in name:
        return "connection_error"
    return "provider_error"


class GroqTextProvider:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def complete(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_completion_tokens: int,
        timeout_seconds: float,
    ) -> str:
        try:
            from groq import Groq
        except ImportError as exc:
            raise ProviderError("provider_not_installed", "groq package is not installed") from exc

        client = Groq(api_key=self.api_key, max_retries=0, timeout=timeout_seconds)

        try:
            completion = client.chat.completions.create(
                model=model,
                temperature=temperature,
                max_completion_tokens=max_completion_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as exc:
            raise ProviderError(_classify_provider_error(exc), str(exc)) from exc

        return str(completion.choices[0].message.content or "")


def _build_provider(config: LLMConfig, provider: TextProvider | None = None) -> TextProvider | None:
    if provider is not None:
        return provider
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    return GroqTextProvider(api_key)


def synthesize_answer(
    *,
    query: str,
    evidence: Sequence[Any],
    provider: TextProvider | None = None,
) -> dict[str, Any]:
    config = _load_config()
    result = {
        "answer": "",
        "model": config.model if config.enabled else "none",
        "answer_source": "fallback:raw_evidence" if evidence else "none:insufficient_evidence",
        **_metadata_from_config(config),
    }

    if not evidence:
        if _looks_unclear(query, evidence, config):
            fallback_question = _deterministic_clarification(query)
            selected_provider = _build_provider(config, provider)
            if config.enabled and selected_provider is not None:
                try:
                    clarification_text = selected_provider.complete(
                        model=config.model,
                        system_prompt=SYSTEM_PROMPT,
                        user_prompt=_build_clarification_prompt(query, evidence, [], fallback_question),
                        temperature=config.temperature,
                        max_completion_tokens=min(config.max_completion_tokens, 128),
                        timeout_seconds=config.timeout_seconds,
                    )
                    result["answer"] = _extract_text_completion(clarification_text, fallback_question)
                    result["answer_source"] = f"clarification:groq:{config.model}"
                    return result
                except ProviderError as exc:
                    result["llm_error_code"] = exc.code
                    result["llm_fallback_reason"] = "clarification_provider_failed"
            result["answer"] = fallback_question
            result["answer_source"] = "clarification:heuristic"
            return result

        result["answer"] = (
            f"{INSUFFICIENT_EVIDENCE_MESSAGE} I could not find support for that topic in the uploaded document."
        )
        return result

    if not config.enabled:
        result["answer"] = str(getattr(evidence[0], "text", "") or "")
        result["answer_source"] = "fallback:raw_evidence"
        result["llm_fallback_reason"] = "llm_disabled"
        return result

    selected_provider = _build_provider(config, provider)
    if selected_provider is None:
        result["answer"] = str(getattr(evidence[0], "text", "") or "")
        result["answer_source"] = "fallback:raw_evidence"
        result["llm_fallback_reason"] = "missing_api_key"
        return result

    notes = _build_reasoning_notes(query, evidence, config)
    if _looks_unclear(query, evidence, config):
        fallback_question = _deterministic_clarification(query)
        try:
            clarification_text = selected_provider.complete(
                model=config.model,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=_build_clarification_prompt(query, evidence, notes, fallback_question),
                temperature=config.temperature,
                max_completion_tokens=min(config.max_completion_tokens, 128),
                timeout_seconds=config.timeout_seconds,
            )
            result["answer"] = _extract_text_completion(clarification_text, fallback_question)
            result["answer_source"] = f"clarification:groq:{config.model}"
            return result
        except ProviderError as exc:
            logger.warning("Clarification generation failed: %s", exc.code)
            result["llm_error_code"] = exc.code
            result["llm_fallback_reason"] = "clarification_provider_failed"
            result["answer"] = fallback_question
            result["answer_source"] = "clarification:heuristic"
            return result

    prepared = _prepare_evidence(evidence, config)
    if not prepared:
        result["answer"] = str(getattr(evidence[0], "text", "") or "")
        result["answer_source"] = "fallback:raw_evidence"
        result["llm_fallback_reason"] = "empty_prepared_evidence"
        return result

    try:
        answer_text = selected_provider.complete(
            model=config.model,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=_build_synthesis_prompt(query, prepared, notes),
            temperature=config.temperature,
            max_completion_tokens=config.max_completion_tokens,
            timeout_seconds=config.timeout_seconds,
        )
    except ProviderError as exc:
        logger.warning("Groq synthesis failed: %s", exc.code)
        result["answer"] = str(getattr(evidence[0], "text", "") or "")
        result["answer_source"] = "fallback:raw_evidence"
        result["llm_error_code"] = exc.code
        result["llm_fallback_reason"] = "provider_failed"
        return result

    result["answer"] = _extract_text_completion(answer_text)
    result["answer_source"] = f"groq:{config.model}"
    return result
