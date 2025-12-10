# app/ingest_db.py
"""
Database ingestion layer for AI Document Search.

Handles:
- Document metadata inserts/updates
- Chunk metadata inserts
- Embedding map inserts

This file relies on your application's DB helper `app.db.get_conn()` to obtain
a psycopg2 connection. That function should return a psycopg2 connection and
is responsible for reading DB credentials from env / .env.
"""

import uuid
import time
import io
import logging
from typing import List, Dict, Optional, Any

from psycopg2.extras import execute_values, RealDictCursor

try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

# use your project's DB connector
from app.db import get_conn

logger = logging.getLogger("ingest_db")


# -------------------------
# DOCUMENTS
# -------------------------
def insert_document(
    doc_id: str,
    user_id: Optional[str],
    filename: str,
    size_bytes: Optional[int],
    storage: str = "redis",
    total_pages: Optional[int] = None,
    pdf_bytes: Optional[bytes] = None,
) -> str:
    """
    Insert or upsert a document row. Compute total_pages for PDFs if pdf_bytes given.
    Returns the doc_id (string).
    """
    # Optionally compute page count from pdf bytes
    if pdf_bytes:
        try:
            if PdfReader is None:
                raise ImportError("PyPDF2 not installed")
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)
            logger.info("[insert_document] total_pages=%s for filename=%s", total_pages, filename)
        except Exception as e:
            logger.warning("[insert_document] could not read PDF to compute pages: %s", e)
            total_pages = total_pages  # keep passed value or None
    else:
        logger.debug("[insert_document] no pdf_bytes provided for filename=%s", filename)

    sql_text = """
    INSERT INTO documents (
        doc_id, user_id, filename, storage, size_bytes,
        status, total_pages, created_at, updated_at
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, now(), now())
    ON CONFLICT (doc_id) DO UPDATE
        SET filename = EXCLUDED.filename,
            size_bytes = EXCLUDED.size_bytes,
            total_pages = EXCLUDED.total_pages,
            updated_at = now()
    RETURNING doc_id;
    """

    params = (
        doc_id,
        user_id,
        filename,
        storage,
        size_bytes,
        "uploaded",
        total_pages,
    )

    conn = get_conn()
    if not conn:
        raise Exception("Database connection failed in insert_document")

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_text, params)
                row = cur.fetchone()
                if row and "doc_id" in row:
                    logger.info("[insert_document] ensured doc_id=%s", row["doc_id"])
                    return str(row["doc_id"])
                else:
                    raise RuntimeError("insert_document did not return doc_id")
    finally:
        conn.close()


def update_document_status(doc_id: str, status: str) -> None:
    """
    Update the 'status' column for a document.
    """
    sql_text = """
    UPDATE documents
       SET status = %s,
           updated_at = now()
     WHERE doc_id = %s
    """
    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed in update_document_status")
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql_text, (status, doc_id))
    finally:
        conn.close()
    logger.info("Updated document %s status -> %s", doc_id, status)


def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a document record as a dictionary.
    Returns None if not found.
    """
    sql_text = "SELECT * FROM documents WHERE doc_id = %s"
    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed in get_document")
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_text, (doc_id,))
                row = cur.fetchone()
                return dict(row) if row else None
    finally:
        conn.close()


# -------------------------------------------------------------------
# CHUNKS TABLE OPERATIONS
# -------------------------------------------------------------------
def ensure_document_row(conn, doc_id: str, extra_meta: Dict = None):
    """
    Ensure the parent documents row exists for doc_id using an existing connection.
    This function is idempotent and defensive: it provides sensible defaults for
    NOT NULL columns (filename, storage, status, size_bytes) to avoid constraint errors.
    If extra_meta is provided, its keys will be included/overridden in the insert.
    """
    # sensible defaults to avoid NOT NULL violations
    defaults = {
        "user_id": None,
        "filename": "",
        "storage": "redis",
        "size_bytes": 0,
        "status": "uploaded",
        "total_pages": None,
    }

    # Merge extra_meta if present (extra_meta overrides defaults)
    meta = dict(defaults)
    if extra_meta:
        meta.update({k: (v if v is not None else meta.get(k)) for k, v in extra_meta.items()})

    # Build a safe INSERT that includes all the potentially required columns.
    cols = ["doc_id", "user_id", "filename", "storage", "size_bytes", "status", "total_pages", "created_at"]
    placeholders = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO documents ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT (doc_id) DO NOTHING;"

    values = (
        doc_id,
        meta.get("user_id"),
        meta.get("filename"),
        meta.get("storage"),
        meta.get("size_bytes"),
        meta.get("status"),
        meta.get("total_pages"),
        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    with conn.cursor() as cur:
        cur.execute(sql, values)



def insert_chunks_bulk(doc_id: str, chunks: List[Dict]) -> None:
    """
    Bulk insert chunk metadata into the `chunks` table.

    Each dict should include:
      - chunk_index (int)
      - redis_key (str) (optional)
      - stored_bytes (int) (optional)
    Optional:
      - text_preview (str)
      - start_token, end_token, token_count (int)
      - chunk_id (UUID string; auto-generated if missing)
    """
    if not chunks:
        logger.info("No chunks to insert for doc_id=%s", doc_id)
        return

    sql_text = """
    INSERT INTO chunks (chunk_id, doc_id, chunk_index, start_offset, end_offset,
                        text_preview, redis_key, stored_bytes, created_at, token_count)
    VALUES %s
    ON CONFLICT (chunk_id) DO NOTHING;
    """

    rows = []
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for ch in chunks:
        # Defensive defaults
        chunk_id = ch.get("chunk_id") or str(uuid.uuid4())
        chunk_index = int(ch.get("chunk_index", 0) or 0)
        start_offset = int(ch.get("start_token", 0) or 0)
        end_offset = int(ch.get("end_token", 0) or 0)
        text_preview = ch.get("text_preview") or ""
        redis_key = ch.get("redis_key") or ""   # ensure non-null
        stored_bytes = int(ch.get("stored_bytes", 0) or 0)
        token_count = int(ch.get("token_count", 0) or 0)

        rows.append((
            chunk_id,
            doc_id,
            chunk_index,
            start_offset,
            end_offset,
            text_preview,
            redis_key,
            stored_bytes,
            now_iso,
            token_count,
        ))

    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed in insert_chunks_bulk")

    try:
        # Ensure the parent document exists and insert chunks in one transaction
        with conn:
            ensure_document_row(conn, doc_id, extra_meta=None)
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()

    logger.info("Inserted %d chunk rows for doc_id=%s", len(rows), doc_id)


# -------------------------------------------------------------------
# EMBEDDINGS MAP TABLE OPERATIONS
# -------------------------------------------------------------------
def insert_embeddings_map_bulk(entries: List[Dict]) -> None:
    """
    Bulk insert embeddings into `embeddings_map`.

    Each dict must include:
      - chunk_id (UUID)
      - vector_index (int)
    Optional:
      - model_name (str)
      - score (float)
    """
    if not entries:
        return

    sql_text = """
    INSERT INTO embeddings_map (chunk_id, vector_index, model_name, score, created_at)
    VALUES %s;
    """

    rows = []
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for e in entries:
        rows.append((
            e["chunk_id"],
            e["vector_index"],
            e.get("model_name"),
            e.get("score"),
            now_iso,
        ))

    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed in insert_embeddings_map_bulk")
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()

    logger.info("Inserted %d embedding map entries", len(rows))
