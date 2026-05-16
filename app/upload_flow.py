# upload_flow.py
# Fast synchronous upload path: PDF -> blocks -> Redis text -> return doc_id.
# Embeddings and table extraction are deferred to a queue-backed worker.

import logging
import uuid
from typing import Optional

from app.ingest_db import insert_document, insert_document_content
from app.redis_client import put_doc_binary, put_doc_text
from app.table_store import enqueue_processing_job, refresh_document_status

logger = logging.getLogger("upload_flow")


def handle_text_upload(
    user_id: Optional[str],
    filename: str,
    full_text: str,
    pdf_bytes: Optional[bytes] = None,
) -> str:
    """
    Fast upload path (<3s target):
    1. Generate doc_id
    2. Store full text in Redis
    3. Insert document metadata in PostgreSQL
    4. Extract geometry blocks (PDF only)
    5. Queue background jobs for block embeddings + table extraction
    
    Returns: doc_id
    """
    # 1) Generate doc_id
    doc_id = str(uuid.uuid4())

    # 2) Store full text in Redis (for preview + chat)
    try:
        ok = put_doc_text(doc_id, full_text)
        logger.info(
            "[upload_flow] put_doc_text doc_id=%s success=%s bytes=%d",
            doc_id,
            bool(ok),
            len(full_text.encode("utf-8", errors="replace")),
        )
    except Exception as e:
        logger.exception("[upload_flow] put_doc_text FAILED for %s: %s", doc_id, e)
        raise

    # 2b) Persist full text permanently in PostgreSQL (non-fatal fallback store)
    try:
        insert_document_content(doc_id, full_text)
    except Exception as e:
        # Non-fatal: Redis has the text, PG is just a permanent backup
        logger.warning(
            "[upload_flow] insert_document_content failed for %s: %s (non-fatal)",
            doc_id,
            e,
        )

    # 3) Insert document metadata (FK anchor) - defaults to status='uploaded'
    try:
        insert_document(
            doc_id=doc_id,
            user_id=user_id,
            filename=filename or "",
            size_bytes=len(pdf_bytes) if pdf_bytes else len(full_text.encode("utf-8")),
            storage="redis",
            total_pages=None,
            pdf_bytes=pdf_bytes,
        )
    except Exception as e:
        logger.exception("[upload_flow] insert_document failed for %s: %s", doc_id, e)
        raise

    if pdf_bytes:
        try:
            put_doc_binary(doc_id, pdf_bytes, kind="pdf")
        except Exception as e:
            logger.warning("[upload_flow] failed to persist pdf bytes for doc_id=%s: %s", doc_id, e)

    # 4) Extract geometry blocks (PDFs only) - enables spatial reranking
    block_count = 0
    if pdf_bytes:
        try:
            from block_extractor import process_document
            blocks = process_document(doc_id=doc_id, pdf_bytes=pdf_bytes)
            block_count = len(blocks)
            logger.info(
                "[upload_flow] extracted %d geometry blocks for doc_id=%s",
                block_count,
                doc_id,
            )
        except Exception as e:
            # Non-fatal: blocks enhance search but aren't required
            logger.warning("[upload_flow] block extraction failed for %s: %s", doc_id, e)

    # 5) Queue async processing jobs
    if block_count > 0:
        enqueue_processing_job(doc_id, "embed_blocks", payload={"doc_id": doc_id}, required=True)

    if pdf_bytes:
        enqueue_processing_job(doc_id, "extract_tables", payload={"doc_id": doc_id}, required=True)
        enqueue_processing_job(doc_id, "detect_visuals", payload={"doc_id": doc_id}, required=False)

    if block_count > 0 or pdf_bytes:
        refresh_document_status(doc_id)

    logger.info("[upload_flow] FAST PATH COMPLETE doc_id=%s blocks=%d. Async jobs queued.", doc_id, block_count)

    return doc_id
