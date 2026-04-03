from __future__ import annotations

import io
import logging
import os
import re
import tempfile
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

import fitz

from app.storage import Image, pytesseract
from app.table_store import (
    delete_embeddings_for_document,
    delete_tables_for_document,
    get_document_filename,
    insert_document_tables,
    insert_embeddings,
    insert_table_failure,
    insert_table_page_detections,
)

logger = logging.getLogger("table_pipeline")

DETECTOR_VERSION = "heuristic-v1"
TABLE_DETECTION_THRESHOLD = float(os.environ.get("TABLE_DETECTION_THRESHOLD", "0.55"))
TABLE_MAX_EMPTY_CELL_RATIO = float(os.environ.get("TABLE_MAX_EMPTY_CELL_RATIO", "0.75"))


def _round_bucket(value: float, bucket: int = 12) -> int:
    return int(round(value / bucket) * bucket)


def _group_words_into_rows(words: Sequence[Tuple[float, float, float, float, str]]) -> List[List[Tuple[float, float, float, float, str]]]:
    rows: Dict[int, List[Tuple[float, float, float, float, str]]] = defaultdict(list)
    for x1, y1, x2, y2, text in words:
        rows[_round_bucket(y1)].append((x1, y1, x2, y2, text))
    ordered_rows = []
    for key in sorted(rows):
        ordered_rows.append(sorted(rows[key], key=lambda item: item[0]))
    return ordered_rows


def _extract_page_words(page: fitz.Page) -> List[Tuple[float, float, float, float, str]]:
    words = []
    for raw_word in page.get_text("words") or []:
        if len(raw_word) < 5:
            continue
        x1, y1, x2, y2, text = raw_word[:5]
        text = str(text).strip()
        if text:
            words.append((float(x1), float(y1), float(x2), float(y2), text))
    return words


def _extract_ocr_words(page: fitz.Page) -> List[Tuple[float, float, float, float, str]]:
    if not (pytesseract and Image):
        return []

    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png")))
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    except Exception as exc:
        logger.warning("OCR word extraction failed on page %s: %s", page.number + 1, exc)
        return []

    words: List[Tuple[float, float, float, float, str]] = []
    scale_x = page.rect.width / max(image.width, 1)
    scale_y = page.rect.height / max(image.height, 1)

    for idx, text in enumerate(data.get("text", [])):
        text = (text or "").strip()
        if not text:
            continue
        try:
            conf = float(data.get("conf", [0])[idx])
        except Exception:
            conf = 0.0
        if conf < 0:
            continue

        left = float(data.get("left", [0])[idx]) * scale_x
        top = float(data.get("top", [0])[idx]) * scale_y
        width = float(data.get("width", [0])[idx]) * scale_x
        height = float(data.get("height", [0])[idx]) * scale_y
        words.append((left, top, left + width, top + height, text))

    return words


def _compute_detection_features(words: Sequence[Tuple[float, float, float, float, str]]) -> Dict[str, Any]:
    rows = _group_words_into_rows(words)
    flat_text = " ".join(word[4] for word in words)
    alpha_numeric = [ch for ch in flat_text if ch.isalnum()]
    digits = sum(1 for ch in alpha_numeric if ch.isdigit())
    numeric_density = digits / len(alpha_numeric) if alpha_numeric else 0.0

    structured_rows = [row for row in rows if len(row) >= 2]
    structured_ratio = len(structured_rows) / len(rows) if rows else 0.0

    x_buckets: Dict[int, int] = defaultdict(int)
    for row in structured_rows:
        for x1, _, _, _, _ in row[:6]:
            x_buckets[_round_bucket(x1)] += 1
    recurring_columns = sum(1 for count in x_buckets.values() if count >= 2)
    alignment_ratio = min(1.0, recurring_columns / 4.0)

    delimiter_bonus = 0.1 if re.search(r"(\|)|(\t)|(\s{3,})", flat_text) else 0.0
    confidence = min(
        1.0,
        (numeric_density * 0.45) + (structured_ratio * 0.35) + (alignment_ratio * 0.20) + delimiter_bonus,
    )

    return {
        "numeric_density": round(numeric_density, 4),
        "structured_row_ratio": round(structured_ratio, 4),
        "alignment_ratio": round(alignment_ratio, 4),
        "recurring_columns": recurring_columns,
        "row_count": len(rows),
        "token_count": len(words),
        "confidence": round(confidence, 4),
    }


def detect_table_pages(pdf_bytes: bytes, doc_id: str) -> List[Dict[str, Any]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    detections: List[Dict[str, Any]] = []

    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            words = _extract_page_words(page)
            source = "pymupdf"
            if not words:
                words = _extract_ocr_words(page)
                source = "ocr" if words else "empty"

            features = _compute_detection_features(words)
            features["source"] = source
            confidence = float(features["confidence"])
            detections.append(
                {
                    "detection_id": str(uuid.uuid4()),
                    "doc_id": doc_id,
                    "page_number": page_idx + 1,
                    "confidence": confidence,
                    "detected": confidence >= TABLE_DETECTION_THRESHOLD,
                    "detector_version": DETECTOR_VERSION,
                    "features": features,
                }
            )
    finally:
        doc.close()

    return detections


def _normalize_numeric_cell(value: str) -> Any:
    value = (value or "").strip()
    if not value:
        return ""

    raw = value.replace(",", "").replace(" ", "")
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    raw = re.sub(r"^[\$\u20ac\u00a3\u20b9]", "", raw)

    if raw.endswith("%"):
        raw = raw[:-1]

    try:
        if "." in raw:
            number: Any = float(raw)
        else:
            number = int(raw)
        return -number if negative else number
    except Exception:
        return value


def normalize_cell_matrix(matrix: Sequence[Sequence[str]]) -> List[List[Any]]:
    return [[_normalize_numeric_cell(cell) for cell in row] for row in matrix]


def _rectangularize(matrix: Sequence[Sequence[str]]) -> List[List[str]]:
    max_cols = max((len(row) for row in matrix), default=0)
    return [[str(cell).strip() for cell in list(row) + ([""] * (max_cols - len(row)))] for row in matrix]


def validate_cell_matrix(matrix: Sequence[Sequence[str]]) -> Tuple[bool, Dict[str, Any]]:
    rect = _rectangularize(matrix)
    row_count = len(rect)
    column_count = max((len(row) for row in rect), default=0)
    total_cells = row_count * column_count
    empty_cells = sum(1 for row in rect for cell in row if not str(cell).strip())
    empty_ratio = (empty_cells / total_cells) if total_cells else 1.0

    is_valid = row_count >= 2 and column_count >= 2 and empty_ratio <= TABLE_MAX_EMPTY_CELL_RATIO

    return is_valid, {
        "row_count": row_count,
        "column_count": column_count,
        "empty_cell_ratio": round(empty_ratio, 4),
        "cell_matrix": rect,
    }


def matrix_to_markdown(matrix: Sequence[Sequence[str]]) -> str:
    rect = _rectangularize(matrix)
    if not rect:
        return ""

    header = rect[0]
    body = rect[1:] if len(rect) > 1 else []
    separator = ["---"] * len(header)

    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(separator) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _camelot_bbox(table: Any, page_height: float) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    raw_bbox = getattr(table, "_bbox", None)
    if not raw_bbox or len(raw_bbox) != 4:
        return None, None, None, None

    x1, y1, x2, y2 = raw_bbox
    top = float(page_height) - float(y2)
    bottom = float(page_height) - float(y1)
    return float(x1), top, float(x2), bottom


def _find_context_above_table(
    page_blocks: Sequence[Any],
    bbox_y1: Optional[float],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if bbox_y1 is None:
        return None, None, None

    above_blocks = [block for block in page_blocks if getattr(block, "y2", 0) <= bbox_y1]
    if not above_blocks:
        return None, None, None

    above_blocks = sorted(above_blocks, key=lambda block: abs(getattr(block, "y2", 0) - bbox_y1))
    caption_text = above_blocks[0].text.strip() if above_blocks else None
    heading_text = None
    context_text = None

    for block in above_blocks:
        if getattr(block, "block_type", "") == "header" and block.text.strip():
            heading_text = block.text.strip()
            break

    context_candidates = [block.text.strip() for block in above_blocks[:3] if block.text.strip()]
    if context_candidates:
        context_text = "\n".join(reversed(context_candidates))

    return caption_text, heading_text, context_text


def _read_camelot_tables(pdf_path: str, page_number: int) -> Tuple[List[Any], List[str]]:
    errors: List[str] = []

    try:
        import camelot  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Camelot import failed: {exc}") from exc

    for flavor in ("lattice", "stream"):
        try:
            tables = camelot.read_pdf(pdf_path, pages=str(page_number), flavor=flavor)
            for table in tables:
                setattr(table, "_docmind_flavor", flavor)
            if tables:
                return list(tables), errors
        except Exception as exc:
            errors.append(f"{flavor}: {exc}")

    return [], errors


def _row_embedding_text(
    filename: str,
    page_number: int,
    caption_text: Optional[str],
    heading_text: Optional[str],
    header_row: Sequence[str],
    row_index: int,
    row: Sequence[str],
    full_markdown: str,
) -> str:
    pieces = [
        filename,
        f"Page {page_number}",
        heading_text,
        caption_text,
        "Header row: " + " | ".join(str(cell) for cell in header_row),
        f"Highlighted row {row_index}: " + " | ".join(str(cell) for cell in row),
        "Full table:",
        full_markdown,
    ]
    return "\n".join(piece for piece in pieces if piece)


def extract_and_store_tables(doc_id: str, pdf_bytes: bytes, page_blocks_by_page: Dict[int, List[Any]]) -> Dict[str, int]:
    detections = detect_table_pages(pdf_bytes, doc_id)
    insert_table_page_detections(doc_id, detections)

    detected_pages = [d for d in detections if d["detected"]]
    if not detected_pages:
        delete_embeddings_for_document(doc_id, ["document_table", "document_table_row"])
        delete_tables_for_document(doc_id)
        return {"detections": len(detections), "tables": 0, "rows_embedded": 0}

    delete_embeddings_for_document(doc_id, ["document_table", "document_table_row"])
    delete_tables_for_document(doc_id)

    filename = get_document_filename(doc_id)

    temp_path = ""
    stored_tables: List[Dict[str, Any]] = []
    embedding_records: List[Dict[str, Any]] = []
    rows_embedded = 0

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            temp_path = tmp.name

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            for detection in detected_pages:
                page_number = int(detection["page_number"])
                page = doc[page_number - 1]
                page_blocks = page_blocks_by_page.get(page_number, [])

                try:
                    camelot_tables, errors = _read_camelot_tables(temp_path, page_number)
                except Exception as exc:
                    insert_table_failure(
                        doc_id=doc_id,
                        page_number=page_number,
                        extractor="camelot",
                        error_type="camelot_import_or_runtime",
                        error_message=str(exc),
                        detection_confidence=detection["confidence"],
                        metadata={"page_detection": detection["features"]},
                    )
                    continue

                if not camelot_tables:
                    insert_table_failure(
                        doc_id=doc_id,
                        page_number=page_number,
                        extractor="camelot",
                        error_type="no_tables_found",
                        error_message="; ".join(errors) if errors else "Camelot returned zero tables",
                        detection_confidence=detection["confidence"],
                        metadata={"page_detection": detection["features"]},
                    )
                    continue

                for table_index, camelot_table in enumerate(camelot_tables, start=1):
                    raw_matrix = getattr(camelot_table, "df").fillna("").astype(str).values.tolist()
                    is_valid, details = validate_cell_matrix(raw_matrix)

                    if not is_valid:
                        insert_table_failure(
                            doc_id=doc_id,
                            page_number=page_number,
                            extractor=f"camelot:{getattr(camelot_table, '_docmind_flavor', 'unknown')}",
                            error_type="validation_failed",
                            error_message="Table failed validation",
                            detection_confidence=detection["confidence"],
                            metadata={"validation": details},
                        )
                        continue

                    rect_matrix = details["cell_matrix"]
                    normalized_matrix = normalize_cell_matrix(rect_matrix)
                    markdown = matrix_to_markdown(rect_matrix)
                    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = _camelot_bbox(camelot_table, page.rect.height)
                    caption_text, heading_text, context_text = _find_context_above_table(page_blocks, bbox_y1)
                    table_id = str(uuid.uuid4())

                    stored_tables.append(
                        {
                            "table_id": table_id,
                            "doc_id": doc_id,
                            "page_number": page_number,
                            "table_index": table_index,
                            "block_type": "table",
                            "caption_text": caption_text,
                            "heading_text": heading_text,
                            "context_text": context_text,
                            "raw_markdown": markdown,
                            "highlighted_row_text": None,
                            "cell_matrix": rect_matrix,
                            "normalized_matrix": normalized_matrix,
                            "row_count": details["row_count"],
                            "column_count": details["column_count"],
                            "empty_cell_ratio": details["empty_cell_ratio"],
                            "detection_confidence": detection["confidence"],
                            "extractor": f"camelot:{getattr(camelot_table, '_docmind_flavor', 'unknown')}",
                            "bbox_x1": bbox_x1,
                            "bbox_y1": bbox_y1,
                            "bbox_x2": bbox_x2,
                            "bbox_y2": bbox_y2,
                            "metadata": {
                                "page_detection": detection["features"],
                                "parsing_report": getattr(camelot_table, "parsing_report", None),
                            },
                        }
                    )

                    full_table_text = "\n".join(
                        piece
                        for piece in [filename, f"Page {page_number}", heading_text, caption_text, context_text, markdown]
                        if piece
                    )
                    embedding_records.append(
                        {
                            "doc_id": doc_id,
                            "entity_type": "document_table",
                            "entity_id": table_id,
                            "parent_entity_id": None,
                            "block_id": None,
                            "table_id": table_id,
                            "visual_id": None,
                            "row_index": None,
                            "page_number": page_number,
                            "block_type": "table",
                            "content_text": full_table_text,
                            "metadata": {
                                "table_id": table_id,
                                "caption_text": caption_text,
                                "heading_text": heading_text,
                            },
                        }
                    )

                    header_row = rect_matrix[0]
                    for row_index, row in enumerate(rect_matrix[1:], start=1):
                        row_text = "| " + " | ".join(row) + " |"
                        embedding_records.append(
                            {
                                "doc_id": doc_id,
                                "entity_type": "document_table_row",
                                "entity_id": f"{table_id}:row:{row_index}",
                                "parent_entity_id": table_id,
                                "block_id": None,
                                "table_id": table_id,
                                "visual_id": None,
                                "row_index": row_index,
                                "page_number": page_number,
                                "block_type": "table",
                                "content_text": _row_embedding_text(
                                    filename=filename,
                                    page_number=page_number,
                                    caption_text=caption_text,
                                    heading_text=heading_text,
                                    header_row=header_row,
                                    row_index=row_index,
                                    row=row,
                                    full_markdown=markdown,
                                ),
                                "metadata": {
                                    "table_id": table_id,
                                    "row_index": row_index,
                                    "row_text": row_text,
                                },
                            }
                        )
                        rows_embedded += 1
        finally:
            doc.close()
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.warning("Failed to remove temporary PDF %s", temp_path)

    if stored_tables:
        insert_document_tables(stored_tables)

    if embedding_records:
        from embedding_service import embed_texts

        embeddings = embed_texts([record["content_text"] for record in embedding_records]).tolist()
        for record, embedding in zip(embedding_records, embeddings):
            record["embedding"] = "[" + ",".join(map(str, embedding)) + "]"
        insert_embeddings(embedding_records)

    return {"detections": len(detections), "tables": len(stored_tables), "rows_embedded": rows_embedded}
