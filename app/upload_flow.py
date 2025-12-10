# upload_flow.py (replace handle_text_upload with the block below)
import io
import logging
import uuid
from app.redis_client import put_doc_text, build_chunks_from_redis
from app.ingest_db import insert_document, insert_chunks_bulk
from typing import Optional
from pypdf import PdfReader
from app.ingest_db import insert_document, insert_chunks_bulk
from semantic_chunker import build_chunks_from_redis

logger = logging.getLogger("upload_flow")

def handle_text_upload(user_id: str, filename: str, uploaded_file_bytes: Optional[bytes] = None, pdf_bytes: Optional[bytes] = None):
    """
    Process an uploaded document and persist metadata + chunks.

    - user_id, filename: metadata
    - uploaded_file_bytes: bytes read from upload (if provided)
    - pdf_bytes: optional explicit bytes to pass to chunker (preferred)
    Returns: doc_id
    """
    # 1) generate doc_id
    doc_id = str(uuid.uuid4())

    # 2) select pdf_bytes (prefer explicit argument)
    if pdf_bytes is None and uploaded_file_bytes is not None:
        pdf_bytes = uploaded_file_bytes

    size_bytes = len(pdf_bytes) if pdf_bytes else 0
    total_pages = None

    # 3) persist minimal document metadata so FK target exists
    try:
        insert_document(
            doc_id=doc_id,
            user_id=user_id,
            filename=filename or "",
            size_bytes=size_bytes,
            storage="redis",
            total_pages=total_pages,
            pdf_bytes=None,
        )
    except Exception as e:
        # log and continue - document row insert failing is serious, consider raising if you want to abort
        logger.exception("Failed to insert document metadata for %s: %s", doc_id, e)

    # 4) build chunk metadata (dry_run=True recommended so semantic_chunker doesn't write DB)
    try:
        chunk_dicts = build_chunks_from_redis(
            doc_id=doc_id,
            redis_client=None,
            pdf_path=None,
            pdf_bytes=pdf_bytes,
            nlp=None,
            window_size=3,
            buffer_size=1,
            dry_run=True
        )

        if chunk_dicts:
            insert_chunks_bulk(doc_id, chunk_dicts)
            logger.info("[handle_text_upload] Inserted %d chunk records for doc_id=%s", len(chunk_dicts), doc_id)
            print(f"[handle_text_upload] Inserted {len(chunk_dicts)} chunk records for doc_id={doc_id}")
        else:
            logger.info("[handle_text_upload] No chunks returned for doc_id=%s", doc_id)
            print(f"[handle_text_upload] No chunks returned for doc_id={doc_id}")

    except Exception as e:
        # document metadata exists; chunking failed — log for retry/snooze
        logger.exception("[handle_text_upload] build_chunks_from_redis or insert_chunks_bulk failed for doc_id=%s: %s", doc_id, e)
        print(f"[handle_text_upload] Warning: build_chunks_from_redis or insert_chunks_bulk failed: {e}")

    return doc_id