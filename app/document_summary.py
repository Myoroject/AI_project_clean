from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from block_extractor import get_blocks_for_document
from embedding_service import embed_texts
from app.llm_service import GroqTextProvider
from app.table_store import get_document_tables_outline, get_document_visuals_outline

logger = logging.getLogger("document_summary")

HEADING_HINTS = (
    "executive summary",
    "overview",
    "highlights",
    "key highlights",
    "management discussion",
    "financial highlights",
    "conclusion",
    "summary",
    "results",
    "outlook",
)


@dataclass
class SummaryCandidate:
    evidence_id: str
    page_number: int
    block_id: str
    block_type: str
    source_type: str
    text: str
    structural_score: float
    citation_label: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    semantic_score: float = 0.0
    final_score: float = 0.0
    local_summary: str = ""


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _clip(text: str, limit: int) -> str:
    cleaned = _clean_text(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(0, limit - 3)].rstrip() + "..."


def _filename_stem(filename: str) -> str:
    base = (filename or "document").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in base:
        base = ".".join(base.split(".")[:-1]) or base
    return base.replace("_", " ").replace("-", " ").strip() or "document"


def _structural_block_score(block: Any) -> float:
    text = _clean_text(getattr(block, "text", "") or "")
    if not text:
        return 0.0

    score = 0.25
    block_type = str(getattr(block, "block_type", "") or "")
    page_number = int(getattr(block, "page_number", 0) or 0)
    lower = text.lower()
    text_len = len(text)
    digit_ratio = sum(ch.isdigit() for ch in text) / max(len([ch for ch in text if ch.isalnum()]), 1)

    if block_type == "header":
        score += 0.65
    elif block_type == "paragraph":
        score += 0.35
    elif block_type == "table":
        score += 0.45
    elif block_type == "line":
        score += 0.15

    if page_number in (1, 2):
        score += 0.25

    if any(hint in lower for hint in HEADING_HINTS):
        score += 0.45

    if 160 <= text_len <= 1400:
        score += 0.25
    elif 60 <= text_len < 160:
        score += 0.12
    elif text_len > 1800:
        score -= 0.10

    if digit_ratio >= 0.2:
        score += 0.10

    if lower.startswith(("note ", "table ", "figure ")):
        score += 0.12

    if block_type in {"footer", "empty"}:
        score = 0.0

    return max(score, 0.0)


def _table_summary(table: Dict[str, Any]) -> str:
    title = _clean_text(table.get("heading_text") or table.get("caption_text") or "")
    markdown = _clean_text(table.get("raw_markdown") or "")
    prefix = f"{title}. " if title else ""
    shape = f"Table with {table.get('row_count') or 0} rows and {table.get('column_count') or 0} columns."
    if markdown:
        return _clip(f"{prefix}{shape} {markdown}", 420)
    return _clip(f"{prefix}{shape}", 220)


def _visual_summary(visual: Dict[str, Any]) -> str:
    summary = _clean_text(visual.get("visual_summary") or "")
    ocr_text = _clean_text(visual.get("ocr_text") or "")
    label = "Chart" if str(visual.get("block_type") or "") == "chart" else "Figure"
    if summary:
        return _clip(f"{label}: {summary}", 300)
    if ocr_text:
        return _clip(f"{label}: {ocr_text}", 260)
    return f"{label} detected on page {visual.get('page_number') or '?'}."


def _block_summary(text: str) -> str:
    clean = _clean_text(text)
    if not clean:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", clean)
    snippet = " ".join(part for part in parts[:2] if part)
    return _clip(snippet or clean, 320)


def _build_candidates(doc_id: str) -> List[SummaryCandidate]:
    candidates: List[SummaryCandidate] = []

    try:
        blocks = get_blocks_for_document(doc_id)
    except Exception as exc:
        logger.warning("Block candidates unavailable for summary doc=%s: %s", doc_id, exc)
        blocks = []
    for block in blocks:
        structural = _structural_block_score(block)
        if structural <= 0:
            continue
        text = _clean_text(block.text)
        if len(text) < 40:
            continue
        evidence_id = f"E{len(candidates) + 1}"
        candidates.append(
            SummaryCandidate(
                evidence_id=evidence_id,
                page_number=block.page_number,
                block_id=block.block_id,
                block_type=block.block_type,
                source_type="document_block",
                text=text,
                structural_score=structural,
                citation_label=f"Page {block.page_number}",
            )
        )

    try:
        tables = get_document_tables_outline(doc_id)
    except Exception as exc:
        logger.warning("Table candidates unavailable for summary doc=%s: %s", doc_id, exc)
        tables = []
    for table in tables[:12]:
        text = _table_summary(table)
        if not text:
            continue
        evidence_id = f"E{len(candidates) + 1}"
        title = _clean_text(table.get("heading_text") or table.get("caption_text") or "Table")
        candidates.append(
            SummaryCandidate(
                evidence_id=evidence_id,
                page_number=int(table.get("page_number") or 0),
                block_id=str(table.get("table_id") or ""),
                block_type="table",
                source_type="document_table",
                text=text,
                structural_score=1.05 + (0.08 if title else 0.0),
                citation_label=f"Page {table.get('page_number') or '?'}",
                metadata={
                    "title": title,
                    "row_count": table.get("row_count"),
                    "column_count": table.get("column_count"),
                },
            )
        )

    try:
        visuals = get_document_visuals_outline(doc_id)
    except Exception as exc:
        logger.warning("Visual candidates unavailable for summary doc=%s: %s", doc_id, exc)
        visuals = []
    for visual in visuals[:12]:
        text = _visual_summary(visual)
        if not text:
            continue
        evidence_id = f"E{len(candidates) + 1}"
        is_chart = str(visual.get("block_type") or "") == "chart"
        candidates.append(
            SummaryCandidate(
                evidence_id=evidence_id,
                page_number=int(visual.get("page_number") or 0),
                block_id=str(visual.get("visual_id") or ""),
                block_type="chart" if is_chart else "figure",
                source_type="document_visual",
                text=text,
                structural_score=0.92 if is_chart else 0.72,
                citation_label=f"Page {visual.get('page_number') or '?'}",
            )
        )

    return candidates


def _score_candidates(candidates: List[SummaryCandidate]) -> None:
    if not candidates:
        return

    ranked = sorted(candidates, key=lambda item: item.structural_score, reverse=True)
    working = ranked[:64]

    try:
        vectors = embed_texts([item.text for item in working])
        centroid = vectors.mean(axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = centroid / norm

        for item, vector in zip(working, vectors):
            semantic = float(np.dot(vector, centroid))
            item.semantic_score = semantic
            item.final_score = (item.structural_score * 0.45) + (semantic * 0.55)
            item.local_summary = (
                _block_summary(item.text)
                if item.source_type == "document_block"
                else item.text
            )

        for item in ranked[64:]:
            item.semantic_score = 0.0
            item.final_score = item.structural_score * 0.80
            item.local_summary = (
                _block_summary(item.text)
                if item.source_type == "document_block"
                else item.text
            )
    except Exception as exc:
        logger.warning("Summary embedding scoring failed: %s", exc)
        for item in candidates:
            item.semantic_score = 0.0
            item.final_score = item.structural_score
            item.local_summary = (
                _block_summary(item.text)
                if item.source_type == "document_block"
                else item.text
            )


def _select_representative_candidates(candidates: List[SummaryCandidate]) -> List[SummaryCandidate]:
    if not candidates:
        return []

    page_caps: Dict[int, int] = {}
    selected: List[SummaryCandidate] = []

    for candidate in sorted(candidates, key=lambda item: item.final_score, reverse=True):
        page_count = page_caps.get(candidate.page_number, 0)
        if candidate.source_type == "document_block" and page_count >= 2:
            continue
        selected.append(candidate)
        page_caps[candidate.page_number] = page_count + 1
        if len(selected) >= 10:
            break

    return selected


def _citations_for(items: Sequence[SummaryCandidate], ids: Sequence[str]) -> List[Dict[str, Any]]:
    lookup = {item.evidence_id: item for item in items}
    citations = []
    for evidence_id in ids:
        item = lookup.get(evidence_id)
        if not item:
            continue
        citations.append(
            {
                "evidence_id": item.evidence_id,
                "block_id": item.block_id,
                "page": item.page_number,
                "block_type": item.block_type,
                "source_type": item.source_type,
                "label": item.citation_label,
            }
        )
    return citations


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    text = (raw_text or "").strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        parsed = json.loads(text[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _llm_summary(items: Sequence[SummaryCandidate]) -> Optional[Dict[str, Any]]:
    if not items:
        return None

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    llm_enabled = os.environ.get("LLM_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
    if not api_key or not llm_enabled:
        return None

    prompt_items = []
    for item in items:
        prompt_items.append(
            f"{item.evidence_id} | {item.citation_label} | {item.block_type} | {item.local_summary}"
        )

    provider = GroqTextProvider(api_key)
    system_prompt = (
        "You summarize documents using only the provided evidence. "
        "Return strict JSON with keys overview, overview_evidence, bullets. "
        "overview must be 1-2 sentences. bullets must contain exactly 3 items. "
        "Each bullet item must be an object with text and evidence keys. "
        "Every evidence key must reference one or more evidence ids from the prompt. "
        "Do not include markdown fences."
    )
    user_prompt = (
        "Evidence:\n"
        + "\n".join(prompt_items)
        + "\n\nReturn JSON in this shape:\n"
        + '{"overview":"...", "overview_evidence":["E1"], "bullets":[{"text":"...","evidence":["E1","E2"]}]}'
    )

    try:
        raw = provider.complete(
            model=os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_completion_tokens=700,
            timeout_seconds=float(os.environ.get("LLM_TIMEOUT_SECONDS", "8")),
        )
    except Exception as exc:
        logger.warning("LLM summary generation failed: %s", exc)
        return None

    parsed = _extract_json_object(raw)
    if not parsed:
        return None
    return parsed


def _heuristic_summary(filename: str, total_pages: Optional[int], items: Sequence[SummaryCandidate]) -> Dict[str, Any]:
    top_items = list(items[:3])
    subject = _filename_stem(filename)
    page_text = f" across {total_pages} pages" if total_pages else ""

    topic_phrases = []
    for item in items[:5]:
        text = item.local_summary or item.text
        phrase = _clip(text, 90)
        if phrase and phrase not in topic_phrases:
            topic_phrases.append(phrase)

    if topic_phrases:
        overview = f"{subject} is analyzed{page_text}, with the document focusing on {topic_phrases[0].lower()}."
    else:
        overview = f"{subject} is analyzed{page_text}, with the most representative pages and structured assets highlighted below."

    bullet_payload = []
    for item in top_items:
        bullet_payload.append(
            {
                "text": item.local_summary or _clip(item.text, 180),
                "evidence": [item.evidence_id],
            }
        )

    while len(bullet_payload) < 3 and items:
        item = items[min(len(bullet_payload), len(items) - 1)]
        bullet_payload.append(
            {
                "text": item.local_summary or _clip(item.text, 180),
                "evidence": [item.evidence_id],
            }
        )

    return {
        "overview": overview,
        "overview_evidence": [top_items[0].evidence_id] if top_items else [],
        "bullets": bullet_payload[:3],
    }


def generate_document_summary(
    doc_id: str,
    *,
    filename: str,
    total_pages: Optional[int],
) -> Dict[str, Any]:
    candidates = _build_candidates(doc_id)
    if not candidates:
        return {
            "overview": f"{_filename_stem(filename)} has been uploaded, but representative document evidence is still being prepared.",
            "overview_citations": [],
            "bullets": [],
            "evidence": [],
        }

    _score_candidates(candidates)
    selected = _select_representative_candidates(candidates)
    summary_payload = _llm_summary(selected) or _heuristic_summary(filename, total_pages, selected)

    evidence_lookup = {item.evidence_id: item for item in selected}
    bullets = []
    for bullet in summary_payload.get("bullets", [])[:3]:
        if not isinstance(bullet, dict):
            continue
        evidence_ids = [str(eid) for eid in bullet.get("evidence", []) if str(eid) in evidence_lookup]
        bullets.append(
            {
                "text": _clean_text(str(bullet.get("text") or "")),
                "citations": _citations_for(selected, evidence_ids),
            }
        )

    overview_evidence_ids = [
        str(eid) for eid in summary_payload.get("overview_evidence", []) if str(eid) in evidence_lookup
    ]

    return {
        "overview": _clean_text(str(summary_payload.get("overview") or "")),
        "overview_citations": _citations_for(selected, overview_evidence_ids),
        "bullets": bullets,
        "evidence": [
            {
                "evidence_id": item.evidence_id,
                "page": item.page_number,
                "block_type": item.block_type,
                "source_type": item.source_type,
                "block_id": item.block_id,
                "summary": item.local_summary or _clip(item.text, 180),
            }
            for item in selected
        ],
    }
