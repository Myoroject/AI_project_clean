import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.table_store import get_document_table, get_document_visual, get_embedding_candidates
from block_extractor import get_top_k_blocks
from embedding_service import embed_query

logger = logging.getLogger("retrieval")


@dataclass
class EvidenceBlock:
    block_id: str
    text: str
    page_number: int
    score: float
    cosine_score: float
    block_type: str
    x1: float
    y1: float
    x2: float
    y2: float
    source_type: str = "document_block"
    parent_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return {
            "block_id": self.block_id,
            "text": self.text,
            "page_number": self.page_number,
            "score": round(self.score, 3),
            "cosine_score": round(self.cosine_score, 3),
            "block_type": self.block_type,
            "source_type": self.source_type,
            "bbox": [self.x1, self.y1, self.x2, self.y2],
        }


def _as_query_vector(query_emb: Any) -> List[float]:
    if hasattr(query_emb, "tolist"):
        query_emb = query_emb.tolist()

    if isinstance(query_emb, tuple):
        query_emb = list(query_emb)

    if isinstance(query_emb, list) and query_emb and isinstance(query_emb[0], list):
        query_emb = query_emb[0]

    return list(query_emb)


def _dedupe_key(candidate: Dict[str, Any]) -> str:
    entity_type = str(candidate.get("entity_type") or "")
    if entity_type == "document_table_row":
        return f"table:{candidate.get('table_id') or candidate.get('parent_entity_id')}"
    if entity_type == "document_table":
        return f"table:{candidate.get('table_id') or candidate.get('entity_id')}"
    if entity_type in {"document_visual_line", "document_visual", "document_chart"}:
        return f"visual:{candidate.get('visual_id') or candidate.get('parent_entity_id') or candidate.get('entity_id')}"
    if entity_type == "document_block":
        return f"block:{candidate.get('block_id') or candidate.get('entity_id')}"
    return f"{entity_type}:{candidate.get('entity_id')}"


def _geometry_score(block_type: str, y1: float, x1: float, x2: float, y2: float) -> float:
    final_score = 0.0

    if block_type == "table":
        final_score += 0.15
    elif block_type == "paragraph":
        final_score += 0.10
    elif block_type == "header":
        final_score += 0.05

    if y1 > 50 and y1 < 750:
        final_score += 0.05

    area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if area > 10000:
        final_score += 0.10
    elif area > 1000:
        final_score += 0.05

    return final_score


def _render_table_text(table: Dict[str, Any], highlighted_row: Optional[str]) -> str:
    parts = []
    if table.get("heading_text"):
        parts.append(str(table["heading_text"]))
    if table.get("caption_text"):
        parts.append(str(table["caption_text"]))
    if highlighted_row:
        parts.append(f"Highlighted row: {highlighted_row}")
    parts.append(str(table.get("raw_markdown") or ""))
    return "\n\n".join(part for part in parts if part)


def _hydrate_block_candidate(doc_id: str, candidate: Dict[str, Any]) -> Optional[EvidenceBlock]:
    entity_id = str(candidate.get("block_id") or candidate["entity_id"])
    blocks = get_top_k_blocks(doc_id, [entity_id], k=1)
    if not blocks:
        return None

    block = blocks[0]
    cosine_score = float(candidate.get("cosine_sim") or 0.0)
    final_score = (cosine_score * 0.60) + _geometry_score(
        block.block_type,
        block.y1,
        block.x1,
        block.x2,
        block.y2,
    )

    return EvidenceBlock(
        block_id=block.block_id,
        text=block.text,
        page_number=block.page_number,
        score=final_score,
        cosine_score=cosine_score,
        block_type=block.block_type,
        x1=block.x1,
        y1=block.y1,
        x2=block.x2,
        y2=block.y2,
        source_type="document_block",
    )


def _hydrate_table_candidate(candidate: Dict[str, Any]) -> Optional[EvidenceBlock]:
    table_id = str(candidate.get("table_id") or candidate.get("parent_entity_id") or candidate.get("entity_id"))
    table = get_document_table(table_id)
    if not table:
        return None

    metadata = candidate.get("metadata") or {}
    highlighted_row = metadata.get("row_text") if isinstance(metadata, dict) else None
    text = _render_table_text(table, highlighted_row)
    cosine_score = float(candidate.get("cosine_sim") or 0.0)
    x1 = float(table.get("bbox_x1") or 0.0)
    y1 = float(table.get("bbox_y1") or 0.0)
    x2 = float(table.get("bbox_x2") or 0.0)
    y2 = float(table.get("bbox_y2") or 0.0)
    final_score = (cosine_score * 0.60) + _geometry_score("table", y1, x1, x2, y2)

    return EvidenceBlock(
        block_id=table_id,
        text=text,
        page_number=int(table.get("page_number") or candidate.get("page_number") or 0),
        score=final_score,
        cosine_score=cosine_score,
        block_type="table",
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        source_type=str(candidate.get("entity_type") or "document_table"),
        parent_id=str(candidate.get("parent_entity_id")) if candidate.get("parent_entity_id") else None,
        metadata=metadata if isinstance(metadata, dict) else {},
    )


def _render_visual_text(visual: Dict[str, Any], highlighted_line: Optional[str]) -> str:
    parts = []
    if visual.get("visual_summary"):
        parts.append(str(visual["visual_summary"]))
    if highlighted_line:
        parts.append(f"Highlighted OCR line: {highlighted_line}")
    if visual.get("ocr_text"):
        parts.append(str(visual["ocr_text"]))
    return "\n\n".join(part for part in parts if part)


def _hydrate_visual_candidate(candidate: Dict[str, Any]) -> Optional[EvidenceBlock]:
    visual_id = str(candidate.get("visual_id") or candidate.get("parent_entity_id") or candidate.get("entity_id"))
    visual = get_document_visual(visual_id)
    if not visual:
        return None

    metadata = candidate.get("metadata") or {}
    highlighted_line = metadata.get("line_text") if isinstance(metadata, dict) else None
    cosine_score = float(candidate.get("cosine_sim") or 0.0)
    x1 = float(visual.get("bbox_x1") or 0.0)
    y1 = float(visual.get("bbox_y1") or 0.0)
    x2 = float(visual.get("bbox_x2") or 0.0)
    y2 = float(visual.get("bbox_y2") or 0.0)
    block_type = str(visual.get("block_type") or "image")
    final_score = (cosine_score * 0.60) + _geometry_score(block_type, y1, x1, x2, y2)

    return EvidenceBlock(
        block_id=visual_id,
        text=_render_visual_text(visual, highlighted_line),
        page_number=int(visual.get("page_number") or candidate.get("page_number") or 0),
        score=final_score,
        cosine_score=cosine_score,
        block_type=block_type,
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        source_type=str(candidate.get("entity_type") or "document_visual"),
        parent_id=str(candidate.get("parent_entity_id")) if candidate.get("parent_entity_id") else None,
        metadata=metadata if isinstance(metadata, dict) else {},
    )


def search(doc_id: str, query: str, top_k: int = 10) -> List[EvidenceBlock]:
    if not query.strip():
        return []

    logger.info("Retrieving for query '%s' in doc %s", query, doc_id)
    query_vector = _as_query_vector(embed_query(query))
    candidates = get_embedding_candidates(doc_id, query_vector, k=max(top_k * 5, 10))

    if not candidates:
        logger.info("No embeddings found for doc_id=%s", doc_id)
        return []

    best_candidates: Dict[str, Dict[str, Any]] = {}
    for candidate in candidates:
        key = _dedupe_key(candidate)
        if key not in best_candidates or float(candidate.get("cosine_sim") or 0.0) > float(
            best_candidates[key].get("cosine_sim") or 0.0
        ):
            best_candidates[key] = candidate

    evidence: List[EvidenceBlock] = []
    for candidate in best_candidates.values():
        entity_type = str(candidate.get("entity_type") or "")
        hydrated: Optional[EvidenceBlock]
        if entity_type == "document_block":
            hydrated = _hydrate_block_candidate(doc_id, candidate)
        elif entity_type in {"document_visual_line", "document_visual", "document_chart"}:
            hydrated = _hydrate_visual_candidate(candidate)
        else:
            hydrated = _hydrate_table_candidate(candidate)
        if hydrated:
            evidence.append(hydrated)

    evidence.sort(key=lambda item: item.score, reverse=True)
    top_evidence = evidence[:top_k]
    logger.info("Unified retrieval returned %d ranked results for doc_id=%s", len(top_evidence), doc_id)
    return top_evidence
