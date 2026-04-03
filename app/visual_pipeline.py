from __future__ import annotations

import io
import logging
import os
import re
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

import fitz

from app.storage import Image, pytesseract
from app.table_store import (
    delete_embeddings_for_document,
    delete_embeddings_for_visual,
    delete_visuals_for_document,
    get_document_visual,
    insert_document_visuals,
    insert_embeddings,
    insert_visual_failure,
    update_document_visual,
)

logger = logging.getLogger("visual_pipeline")

VISUAL_DETECTOR_VERSION = "visual-detector-v1"
VISUAL_MIN_IMAGE_AREA_RATIO = float(os.environ.get("VISUAL_MIN_IMAGE_AREA_RATIO", "0.18"))
VISUAL_FULL_PAGE_AREA_RATIO = float(os.environ.get("VISUAL_FULL_PAGE_AREA_RATIO", "0.60"))
VISUAL_LOW_TEXT_CHAR_THRESHOLD = int(os.environ.get("VISUAL_LOW_TEXT_CHAR_THRESHOLD", "80"))
VISUAL_RENDER_SCALE = float(os.environ.get("VISUAL_RENDER_SCALE", "2.5"))
VISUAL_MAX_OCR_LINES = int(os.environ.get("VISUAL_MAX_OCR_LINES", "120"))

CHART_KEYWORDS = {
    "revenue", "sales", "profit", "expense", "expenses", "income",
    "growth", "trend", "market", "share", "ebitda", "margin",
    "quarter", "q1", "q2", "q3", "q4",
}


def _rect_area(rect: fitz.Rect) -> float:
    return max(0.0, rect.width) * max(0.0, rect.height)


def _page_text_length(page: fitz.Page, clip: Optional[fitz.Rect] = None) -> int:
    try:
        return len((page.get_text("text", clip=clip) or "").strip())
    except Exception:
        return 0


def _extract_candidate_visuals(pdf_bytes: bytes, doc_id: str) -> List[Dict[str, Any]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    visuals: List[Dict[str, Any]] = []

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_area = max(_rect_area(page.rect), 1.0)
            page_text_len = _page_text_length(page)
            visual_index = 0
            seen_rects = set()

            for image_info in page.get_images(full=True):
                if not image_info:
                    continue
                xref = image_info[0]
                try:
                    rects = page.get_image_rects(xref)
                except Exception as exc:
                    logger.warning("Failed to get image rects for page=%s xref=%s: %s", page_index + 1, xref, exc)
                    continue

                for rect in rects:
                    key = (round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1))
                    if key in seen_rects:
                        continue
                    seen_rects.add(key)

                    area_ratio = _rect_area(rect) / page_area
                    text_len_in_rect = _page_text_length(page, clip=rect)
                    is_low_text = text_len_in_rect <= VISUAL_LOW_TEXT_CHAR_THRESHOLD
                    is_large_enough = area_ratio >= VISUAL_MIN_IMAGE_AREA_RATIO
                    is_full_page_scan = area_ratio >= VISUAL_FULL_PAGE_AREA_RATIO and is_low_text

                    if not is_large_enough and not is_full_page_scan:
                        continue

                    visual_index += 1
                    source_kind = "scanned_page" if is_full_page_scan else "embedded_image"
                    visuals.append(
                        {
                            "visual_id": str(uuid.uuid4()),
                            "doc_id": doc_id,
                            "page_number": page_index + 1,
                            "visual_index": visual_index,
                            "block_type": "image",
                            "detector_strategy": VISUAL_DETECTOR_VERSION,
                            "ocr_strategy": None,
                            "summary_strategy": None,
                            "source_kind": source_kind,
                            "bbox_x1": float(rect.x0),
                            "bbox_y1": float(rect.y0),
                            "bbox_x2": float(rect.x1),
                            "bbox_y2": float(rect.y1),
                            "image_area_ratio": round(area_ratio, 4),
                            "ocr_text": None,
                            "ocr_lines": None,
                            "visual_summary": None,
                            "structured_data": None,
                            "confidence_score": round(area_ratio, 4),
                            "extraction_status": "detected",
                            "metadata": {
                                "page_text_length": page_text_len,
                                "region_text_length": text_len_in_rect,
                                "is_low_text_region": is_low_text,
                                "xref": xref,
                            },
                        }
                    )
    finally:
        doc.close()

    return visuals


def detect_and_store_visuals(doc_id: str, pdf_bytes: bytes) -> List[Dict[str, Any]]:
    delete_embeddings_for_document(doc_id, ["document_visual", "document_visual_line", "document_chart"])
    delete_visuals_for_document(doc_id)
    visuals = _extract_candidate_visuals(pdf_bytes, doc_id)
    insert_document_visuals(visuals)
    return visuals


def _render_clip_to_image(pdf_bytes: bytes, page_number: int, rect: fitz.Rect) -> Any:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_number - 1]
        pix = page.get_pixmap(matrix=fitz.Matrix(VISUAL_RENDER_SCALE, VISUAL_RENDER_SCALE), clip=rect, alpha=False)
        return Image.open(io.BytesIO(pix.tobytes("png")))
    finally:
        doc.close()


def _ocr_lines_from_image(image: Any) -> Tuple[List[str], float]:
    if not (pytesseract and Image):
        raise RuntimeError("pytesseract/Pillow not available for OCR")

    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    grouped: Dict[Tuple[int, int, int], List[Tuple[int, str]]] = defaultdict(list)
    confidences: List[float] = []

    for idx, text in enumerate(data.get("text", [])):
        text = (text or "").strip()
        if not text:
            continue
        try:
            conf = float(data.get("conf", [0])[idx])
        except Exception:
            conf = -1.0
        if conf < 0:
            continue

        key = (
            int(data.get("block_num", [0])[idx]),
            int(data.get("par_num", [0])[idx]),
            int(data.get("line_num", [0])[idx]),
        )
        grouped[key].append((idx, text))
        confidences.append(conf)

    lines = []
    for key in sorted(grouped):
        words = [text for _, text in sorted(grouped[key], key=lambda item: item[0])]
        line = " ".join(words).strip()
        if line:
            lines.append(line)
        if len(lines) >= VISUAL_MAX_OCR_LINES:
            break

    confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
    return lines, confidence


def _normalize_ocr_lines(lines: Sequence[str]) -> List[str]:
    normalized = []
    for line in lines:
        clean = re.sub(r"\s+", " ", line).strip()
        if clean:
            normalized.append(clean)
    return normalized


def _visual_embedding_text(page_number: int, block_type: str, ocr_text: str, visual_summary: Optional[str]) -> str:
    parts = [f"Page {page_number}", f"Visual type: {block_type}"]
    if visual_summary:
        parts.append(visual_summary)
    if ocr_text:
        parts.append("OCR text:")
        parts.append(ocr_text)
    return "\n".join(parts)


def _line_embedding_text(page_number: int, block_type: str, line_index: int, line: str) -> str:
    return f"Page {page_number}\nVisual type: {block_type}\nOCR line {line_index}: {line}"


def _extract_year_value_pairs(text: str) -> List[Tuple[str, float]]:
    pairs: List[Tuple[str, float]] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        years = re.findall(r"\b(20\d{2}|19\d{2})\b", line)
        numbers = re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?\b", line)
        if years and numbers:
            for year, value in zip(years, numbers[1:] if len(numbers) > len(years) else numbers):
                try:
                    pairs.append((year, float(value.replace(",", ""))))
                except ValueError:
                    continue
    deduped: Dict[str, float] = {}
    for year, value in pairs:
        deduped[year] = value
    return sorted(deduped.items(), key=lambda item: item[0])


def _summarize_chart_from_ocr(ocr_lines: Sequence[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]], float, Optional[str]]:
    text = "\n".join(ocr_lines)
    lower_text = text.lower()
    years = re.findall(r"\b(20\d{2}|19\d{2})\b", text)
    numbers = re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?%?\b", text)
    matched_keywords = sorted({kw for kw in CHART_KEYWORDS if kw in lower_text})
    points = _extract_year_value_pairs(text)

    if len(years) < 2 and len(numbers) < 4 and not matched_keywords:
        return None, None, 0.0, "OCR could not detect enough chart semantics"

    chart_type = "chart"
    if "%" in text and len(years) < 2:
        chart_type = "pie"
    elif len(years) >= 2:
        chart_type = "bar_or_line"

    trend_direction = "undetermined"
    if len(points) >= 2:
        values = [value for _, value in points]
        if all(values[idx] <= values[idx + 1] for idx in range(len(values) - 1)):
            trend_direction = "increasing"
        elif all(values[idx] >= values[idx + 1] for idx in range(len(values) - 1)):
            trend_direction = "decreasing"
        else:
            trend_direction = "mixed"

    title_hint = matched_keywords[0] if matched_keywords else "metric"
    if len(points) >= 2:
        summary = (
            f"{title_hint.capitalize()} shows a {trend_direction} trend from {points[0][0]} to {points[-1][0]} "
            f"based on OCR-detected chart labels."
        )
    elif len(years) >= 2:
        summary = f"A {chart_type} chart appears to describe {title_hint} across multiple years."
    else:
        summary = f"A {chart_type} chart was detected with OCR text related to {title_hint}."

    structured = {
        "chart_type": chart_type,
        "axis_labels": years[:8],
        "trend_direction": trend_direction,
        "matched_keywords": matched_keywords,
        "detected_points": [{"x": year, "y": value} for year, value in points[:12]],
    }

    confidence = 0.45
    if len(points) >= 2:
        confidence = 0.78
    elif len(years) >= 2 and matched_keywords:
        confidence = 0.66
    elif matched_keywords:
        confidence = 0.55

    return summary, structured, confidence, None


def _build_visual_embeddings(visual: Dict[str, Any]) -> List[Dict[str, Any]]:
    visual_id = str(visual["visual_id"])
    page_number = int(visual["page_number"])
    block_type = str(visual.get("block_type") or "image")
    ocr_text = str(visual.get("ocr_text") or "")
    visual_summary = str(visual.get("visual_summary") or "") or None
    ocr_lines = list(visual.get("ocr_lines") or [])

    records: List[Dict[str, Any]] = [
        {
            "doc_id": visual["doc_id"],
            "entity_type": "document_chart" if block_type == "chart" else "document_visual",
            "entity_id": visual_id,
            "parent_entity_id": None,
            "block_id": None,
            "table_id": None,
            "visual_id": visual_id,
            "row_index": None,
            "page_number": page_number,
            "block_type": block_type,
            "content_text": _visual_embedding_text(page_number, block_type, ocr_text, visual_summary),
            "metadata": {
                "visual_id": visual_id,
                "source_kind": visual.get("source_kind"),
            },
        }
    ]

    for line_index, line in enumerate(ocr_lines, start=1):
        records.append(
            {
                "doc_id": visual["doc_id"],
                "entity_type": "document_visual_line",
                "entity_id": f"{visual_id}:line:{line_index}",
                "parent_entity_id": visual_id,
                "block_id": None,
                "table_id": None,
                "visual_id": visual_id,
                "row_index": line_index,
                "page_number": page_number,
                "block_type": block_type,
                "content_text": _line_embedding_text(page_number, block_type, line_index, line),
                "metadata": {
                    "visual_id": visual_id,
                    "line_index": line_index,
                    "line_text": line,
                },
            }
        )

    return records


def run_visual_ocr(doc_id: str, visual_id: str, pdf_bytes: bytes) -> Dict[str, Any]:
    visual = get_document_visual(visual_id)
    if not visual:
        raise ValueError(f"Visual not found: {visual_id}")

    if not (pytesseract and Image):
        insert_visual_failure(
            doc_id,
            visual.get("page_number"),
            visual_id=visual_id,
            stage="ocr",
            processor="tesseract",
            error_type="ocr_unavailable",
            error_message="pytesseract/Pillow is not available",
        )
        update_document_visual(visual_id, extraction_status="ocr_failed")
        return {"status": "ocr_failed"}

    rect = fitz.Rect(visual["bbox_x1"], visual["bbox_y1"], visual["bbox_x2"], visual["bbox_y2"])
    try:
        image = _render_clip_to_image(pdf_bytes, int(visual["page_number"]), rect)
        lines, ocr_confidence = _ocr_lines_from_image(image)
        lines = _normalize_ocr_lines(lines)
        ocr_text = "\n".join(lines)
    except Exception as exc:
        insert_visual_failure(
            doc_id,
            visual.get("page_number"),
            visual_id=visual_id,
            stage="ocr",
            processor="tesseract",
            error_type="ocr_runtime_failure",
            error_message=str(exc),
            confidence_score=visual.get("confidence_score"),
        )
        update_document_visual(visual_id, extraction_status="ocr_failed")
        return {"status": "ocr_failed"}

    block_type = "image"
    metadata_merge = {"ocr_line_count": len(lines)}
    source_kind = str(visual.get("source_kind") or "")
    if source_kind == "scanned_page":
        block_type = "image"

    update_document_visual(
        visual_id,
        block_type=block_type,
        ocr_strategy="tesseract_region_v1",
        ocr_text=ocr_text,
        ocr_lines=lines,
        confidence_score=ocr_confidence,
        extraction_status="ocr_completed",
        metadata_merge=metadata_merge,
    )

    visual = get_document_visual(visual_id) or visual
    delete_embeddings_for_visual(doc_id, visual_id, ["document_visual", "document_visual_line", "document_chart"])
    embedding_records = _build_visual_embeddings(visual)
    if embedding_records:
        from embedding_service import embed_texts

        vectors = embed_texts([record["content_text"] for record in embedding_records]).tolist()
        for record, vector in zip(embedding_records, vectors):
            record["embedding"] = "[" + ",".join(map(str, vector)) + "]"
        insert_embeddings(embedding_records)

    summary, structured, summary_confidence, summary_error = _summarize_chart_from_ocr(lines)
    chart_candidate = (
        source_kind != "scanned_page"
        and summary is not None
        and structured is not None
        and (
            visual.get("image_area_ratio", 0) < VISUAL_FULL_PAGE_AREA_RATIO
            or structured.get("chart_type") != "chart"
        )
    )

    return {
        "status": "ocr_completed",
        "chart_candidate": chart_candidate,
        "summary": summary,
        "structured": structured,
        "summary_confidence": summary_confidence,
        "summary_error": summary_error,
    }


def run_chart_summary(doc_id: str, visual_id: str) -> Dict[str, Any]:
    visual = get_document_visual(visual_id)
    if not visual:
        raise ValueError(f"Visual not found: {visual_id}")

    ocr_lines = list(visual.get("ocr_lines") or [])
    summary, structured, confidence, error_reason = _summarize_chart_from_ocr(ocr_lines)
    if not summary or not structured:
        insert_visual_failure(
            doc_id,
            visual.get("page_number"),
            visual_id=visual_id,
            stage="vision",
            processor="ocr_heuristic_chart_v1",
            error_type="summary_unavailable",
            error_message=error_reason or "Could not infer chart semantics from OCR text",
            confidence_score=confidence,
            metadata={"ocr_text_preview": (visual.get("ocr_text") or "")[:500]},
        )
        update_document_visual(visual_id, extraction_status="summary_failed")
        return {"status": "summary_failed"}

    update_document_visual(
        visual_id,
        block_type="chart",
        summary_strategy="ocr_heuristic_chart_v1",
        visual_summary=summary,
        structured_data=structured,
        confidence_score=confidence,
        extraction_status="summary_completed",
        metadata_merge={"chart_detected": True},
    )

    visual = get_document_visual(visual_id) or visual
    delete_embeddings_for_visual(doc_id, visual_id, ["document_visual", "document_visual_line", "document_chart"])
    embedding_records = _build_visual_embeddings(visual)
    if embedding_records:
        from embedding_service import embed_texts

        vectors = embed_texts([record["content_text"] for record in embedding_records]).tolist()
        for record, vector in zip(embedding_records, vectors):
            record["embedding"] = "[" + ",".join(map(str, vector)) + "]"
        insert_embeddings(embedding_records)

    return {"status": "summary_completed", "confidence": confidence}
