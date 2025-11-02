# app/ingest_db.py
"""
Database ingestion layer for AI Document Search.

Handles:
- Document metadata inserts/updates
- Chunk metadata inserts
- Embedding map inserts

Now adapted for PostgreSQL (no S3 field) and loads DB connection from .env via app.db.get_conn().
"""

import uuid
import time
import io
from typing import List, Dict, Optional, Any
from psycopg2.extras import execute_values, RealDictCursor
try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None
from app.db import get_conn


def insert_document(
    doc_id: str,
    user_id: Optional[str],
    filename: str,
    size_bytes: Optional[int],
    storage: str = "redis",
    total_pages: Optional[int] = None,
    pdf_bytes: Optional[bytes] = None,
) -> str:
    """Insert or upsert a document row. Compute total_pages for PDFs if pdf_bytes given."""

    # ✅ Compute total_pages only if pdf_bytes exist
    if pdf_bytes:
        try:
            if PdfReader is None:
                raise ImportError("PyPDF2 is not installed")
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)
            print(f"[insert_document] total_pages computed = {total_pages} for {filename}")
        except Exception as e:
            print(f"[insert_document] Warning: could not read PDF: {e}")
            total_pages = None
    else:
        print(f"[insert_document] No pdf_bytes provided for {filename}")

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
        raise Exception("Database connection failed")

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_text, params)
                row = cur.fetchone()
                print(f"[insert_document] Inserted doc_id={row['doc_id']} with total_pages={total_pages}")
                return str(row["doc_id"])
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
        raise Exception("Database connection failed")
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql_text, (status, doc_id))
    finally:
        conn.close()


def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a document record as a dictionary.
    Returns None if not found.
    """
    sql_text = "SELECT * FROM documents WHERE doc_id = %s"
    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed")
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
def insert_chunks_bulk(doc_id: str, chunks: List[Dict]) -> None:
    """
    Bulk insert chunk metadata into the `chunks` table.

    Each dict should include:
      - chunk_index (int)
      - redis_key (str)
      - stored_bytes (int)
    Optional:
      - text_preview (str)
      - start_token, end_token, token_count (int)
      - chunk_id (UUID string; auto-generated if missing)
    """
    if not chunks:
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
        chunk_id = ch.get("chunk_id") or str(uuid.uuid4())
        rows.append((
            chunk_id,
            doc_id,
            int(ch.get("chunk_index", 0)),
            ch.get("start_token"),
            ch.get("end_token"),
            ch.get("text_preview"),
            ch["redis_key"],
            ch.get("stored_bytes"),
            now_iso,
            ch.get("token_count"),
        ))

    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed")
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()


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
        raise Exception("Database connection failed")
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()
