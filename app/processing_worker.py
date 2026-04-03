from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from collections import defaultdict
from typing import Any, Dict

from app.redis_client import get_doc_binary
from app.table_pipeline import extract_and_store_tables
from app.table_store import (
    claim_processing_job,
    complete_processing_job,
    delete_embeddings_for_document,
    fail_processing_job,
    get_document_visual,
    enqueue_processing_job,
    insert_embeddings,
    insert_table_failure,
    insert_visual_failure,
    refresh_document_status,
)
from app.visual_pipeline import detect_and_store_visuals, run_chart_summary, run_visual_ocr
from block_extractor import get_blocks_for_document
from embedding_service import embed_texts

logger = logging.getLogger("processing_worker")

_WORKER_LOCK = threading.Lock()
_WORKER_THREAD: threading.Thread | None = None
_WORKER_ID = f"worker-{uuid.uuid4().hex[:8]}"

BLOCK_EMBED_SKIP_TYPES = {"table", "table_cell", "empty", "footer"}


def _vector_to_str(vector: Any) -> str:
    return "[" + ",".join(map(str, vector)) + "]"


def _looks_like_table_blob(text: str) -> bool:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if len(lines) < 3:
        return False

    numeric_lines = 0
    short_lines = 0
    for line in lines:
        compact = [char for char in line if char.isalnum()]
        if len(line) <= 32:
            short_lines += 1
        if compact:
            digits = sum(1 for char in compact if char.isdigit())
            if digits / len(compact) >= 0.45:
                numeric_lines += 1

    return numeric_lines >= max(2, len(lines) // 2) and short_lines >= max(2, len(lines) - 1)


def _process_embed_blocks(job: Dict[str, Any]) -> None:
    doc_id = str(job["doc_id"])
    blocks = get_blocks_for_document(doc_id)
    block_records = []

    for block in blocks:
        if block.block_type in BLOCK_EMBED_SKIP_TYPES or _looks_like_table_blob(block.text):
            continue
        block_records.append(
            {
                "doc_id": doc_id,
                "entity_type": "document_block",
                "entity_id": block.block_id,
                "parent_entity_id": None,
                "block_id": block.block_id,
                "table_id": None,
                "visual_id": None,
                "row_index": None,
                "page_number": block.page_number,
                "block_type": block.block_type,
                "content_text": block.text,
                "metadata": {
                    "bbox": [block.x1, block.y1, block.x2, block.y2],
                    "parent_block_id": block.parent_block_id,
                },
            }
        )

    delete_embeddings_for_document(doc_id, ["document_block"])

    if not block_records:
        logger.info("No eligible blocks to embed for doc_id=%s", doc_id)
        return

    vectors = embed_texts([record["content_text"] for record in block_records]).tolist()
    for record, vector in zip(block_records, vectors):
        record["embedding"] = _vector_to_str(vector)

    insert_embeddings(block_records)
    logger.info("Embedded %d document blocks for doc_id=%s", len(block_records), doc_id)


def _process_extract_tables(job: Dict[str, Any]) -> None:
    doc_id = str(job["doc_id"])
    pdf_bytes = get_doc_binary(doc_id, kind="pdf")

    if not pdf_bytes:
        insert_table_failure(
            doc_id=doc_id,
            page_number=None,
            extractor="queue",
            error_type="missing_pdf_bytes",
            error_message="Original PDF bytes were not available for queued table extraction.",
            metadata={"job_id": job["job_id"]},
        )
        return

    page_blocks = get_blocks_for_document(doc_id)
    blocks_by_page = defaultdict(list)
    for block in page_blocks:
        blocks_by_page[block.page_number].append(block)

    summary = extract_and_store_tables(doc_id, pdf_bytes, blocks_by_page)
    logger.info("Table extraction finished for doc_id=%s summary=%s", doc_id, summary)


def _process_detect_visuals(job: Dict[str, Any]) -> None:
    doc_id = str(job["doc_id"])
    pdf_bytes = get_doc_binary(doc_id, kind="pdf")

    if not pdf_bytes:
        insert_visual_failure(
            doc_id=doc_id,
            page_number=None,
            stage="detect",
            processor="pymupdf",
            error_type="missing_pdf_bytes",
            error_message="Original PDF bytes were not available for visual detection.",
            metadata={"job_id": job["job_id"]},
        )
        return

    visuals = detect_and_store_visuals(doc_id, pdf_bytes)
    logger.info("Visual detection finished for doc_id=%s candidates=%d", doc_id, len(visuals))

    for visual in visuals:
        enqueue_processing_job(
            doc_id,
            "process_visual_ocr",
            payload={"doc_id": doc_id, "visual_id": visual["visual_id"]},
            required=False,
        )


def _process_visual_ocr(job: Dict[str, Any]) -> None:
    doc_id = str(job["doc_id"])
    visual_id = str((job.get("payload") or {}).get("visual_id") or job.get("visual_id") or "")
    if not visual_id:
        raise ValueError("Missing visual_id for OCR job")

    pdf_bytes = get_doc_binary(doc_id, kind="pdf")
    if not pdf_bytes:
        insert_visual_failure(
            doc_id=doc_id,
            page_number=None,
            visual_id=visual_id,
            stage="ocr",
            processor="tesseract",
            error_type="missing_pdf_bytes",
            error_message="Original PDF bytes were not available for OCR.",
            metadata={"job_id": job["job_id"]},
        )
        return

    result = run_visual_ocr(doc_id, visual_id, pdf_bytes)
    if result.get("chart_candidate"):
        enqueue_processing_job(
            doc_id,
            "process_chart_summary",
            payload={"doc_id": doc_id, "visual_id": visual_id},
            required=False,
        )


def _process_chart_summary(job: Dict[str, Any]) -> None:
    doc_id = str(job["doc_id"])
    visual_id = str((job.get("payload") or {}).get("visual_id") or job.get("visual_id") or "")
    if not visual_id:
        raise ValueError("Missing visual_id for chart summary job")

    visual = get_document_visual(visual_id)
    if not visual:
        insert_visual_failure(
            doc_id=doc_id,
            page_number=None,
            visual_id=visual_id,
            stage="vision",
            processor="ocr_heuristic_chart_v1",
            error_type="visual_not_found",
            error_message="Visual record not found for chart summary.",
            metadata={"job_id": job["job_id"]},
        )
        return

    run_chart_summary(doc_id, visual_id)


def _process_job(job: Dict[str, Any]) -> None:
    job_type = str(job["job_type"])
    if job_type == "embed_blocks":
        _process_embed_blocks(job)
        return
    if job_type == "extract_tables":
        _process_extract_tables(job)
        return
    if job_type == "detect_visuals":
        _process_detect_visuals(job)
        return
    if job_type == "process_visual_ocr":
        _process_visual_ocr(job)
        return
    if job_type == "process_chart_summary":
        _process_chart_summary(job)
        return
    raise ValueError(f"Unknown processing job type: {job_type}")


def _worker_loop() -> None:
    poll_seconds = float(os.environ.get("DOC_PROCESSING_POLL_SECONDS", "2.0"))

    while True:
        try:
            job = claim_processing_job(_WORKER_ID)
            if not job:
                time.sleep(poll_seconds)
                continue

            doc_id = str(job["doc_id"])
            logger.info("Claimed processing job %s type=%s doc_id=%s", job["job_id"], job["job_type"], doc_id)

            try:
                _process_job(job)
                complete_processing_job(str(job["job_id"]))
            except Exception as exc:
                logger.exception("Processing job %s failed: %s", job["job_id"], exc)
                fail_processing_job(str(job["job_id"]), str(exc))
            finally:
                refresh_document_status(doc_id)
        except Exception as exc:
            logger.exception("Processing worker loop error: %s", exc)
            time.sleep(poll_seconds)


def start_processing_worker() -> None:
    global _WORKER_THREAD

    if os.environ.get("ENABLE_DOC_PROCESSING_WORKER", "1") == "0":
        logger.info("Document processing worker disabled by environment")
        return

    with _WORKER_LOCK:
        if _WORKER_THREAD and _WORKER_THREAD.is_alive():
            return

        _WORKER_THREAD = threading.Thread(
            target=_worker_loop,
            name="doc-processing-worker",
            daemon=True,
        )
        _WORKER_THREAD.start()
        logger.info("Started document processing worker %s", _WORKER_ID)
