# app/ingest_db.py
"""
Database ingestion layer for AI Document Search.

Handles:
- Document metadata inserts/updates
- Chunk metadata inserts
- Embedding map inserts

Relies on app.db.get_conn() to return a psycopg2 connection.
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

from app.db import get_conn

logger = logging.getLogger("ingest_db")


# DOCUMENTS
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
    if pdf_bytes:
        try:
            if PdfReader is None:
                raise ImportError("PyPDF2 not installed")
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)
            logger.info("[insert_document] total_pages=%s for filename=%s", total_pages, filename)
        except Exception as e:
            logger.warning("[insert_document] could not read PDF to compute pages: %s", e)
            total_pages = total_pages
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


# CHUNKS TABLE OPERATIONS
def ensure_document_row(conn, doc_id: str, extra_meta: Optional[Dict] = None):
    """
    Ensure the parent documents row exists for doc_id using an existing connection.
    This function inserts sensible defaults for NOT NULL fields so downstream
    chunk inserts don't violate constraints.
    """
    defaults = {
        "user_id": None,
        "filename": "",
        "storage": "redis",
        "size_bytes": 0,
        "status": "uploaded",
        "total_pages": None,
    }

    meta = dict(defaults)
    if extra_meta:
        meta.update({k: (v if v is not None else meta.get(k)) for k, v in extra_meta.items()})

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
      - token_count (int)
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
        chunk_id = ch.get("chunk_id") or str(uuid.uuid4())
        chunk_index = int(ch.get("chunk_index", 0) or 0)
        start_offset = int(ch.get("start_offset", 0) or 0)
        end_offset = int(ch.get("end_offset", 0) or 0)
        full_preview = ch.get("text") or ch.get("text_preview") or ""
        text_preview = (full_preview[:300]) if full_preview else (ch.get("text_preview") or "")
        # Ensure redis_key is never None: use provided key or a stable doc pointer
        redis_key = ch.get("redis_key") or f"doc:{doc_id}"
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
        with conn:
            # Ensure parent documents row exists in same transaction (avoids FK race)
            ensure_document_row(conn, doc_id, extra_meta=None)
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()

    logger.info("Inserted %d chunk rows for doc_id=%s", len(rows), doc_id)


# EMBEDDINGS MAP
def insert_embeddings_map_bulk(entries: List[Dict]) -> None:
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

def update_block_embeddings(block_ids: List[str], embeddings_list: List[List[float]]) -> None:
    """Bulk update embeddings for document blocks in PostgreSQL."""
    if not block_ids or not embeddings_list: return
    
    sql_text = """
    UPDATE document_blocks
    SET embedding = data.embedding::vector
    FROM (VALUES %s) AS data(id, embedding)
    WHERE document_blocks.block_id = data.id::text;
    """
    
    # Format list of lists into strings for pgvector "[0.1, 0.2, ...]"
    rows = []
    for b_id, emb in zip(block_ids, embeddings_list):
        emb_str = "[" + ",".join(map(str, emb)) + "]"
        rows.append((b_id, emb_str))
        
    conn = get_conn()
    if not conn:
        raise Exception("Database connection failed in update_block_embeddings")
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
        logger.info(f"Updated embeddings for {len(block_ids)} blocks natively in Postgres.")
    finally:
        conn.close()


def ensure_search_results_table(conn) -> None:
    """Create the search_results table if it does not exist."""
    with conn.cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS search_results (
            result_id TEXT PRIMARY KEY,
            search_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            block_id TEXT NOT NULL,
            query_text TEXT NOT NULL,
            rank INTEGER NOT NULL,
            answer_text TEXT NOT NULL,
            final_score DOUBLE PRECISION,
            cosine_score DOUBLE PRECISION,
            page_number INTEGER,
            block_type TEXT,
            x1 DOUBLE PRECISION,
            y1 DOUBLE PRECISION,
            x2 DOUBLE PRECISION,
            y2 DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_search_results_search_id
            ON search_results (search_id);

        CREATE INDEX IF NOT EXISTS idx_search_results_doc_id
            ON search_results (doc_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_search_results_block_id
            ON search_results (block_id);
        """)
        conn.commit()


def insert_search_results(doc_id: str, query_text: str, results: List[Any]) -> Optional[str]:
    """
    Persist the ranked search results for a query.

    Each row stores the doc_id + block_id pair plus ranking metadata so the
    full ranked retrieval set can be audited later while the UI only renders
    the top answer.
    """
    if not results:
        return None

    rows = []
    search_id = str(uuid.uuid4())

    for rank, result in enumerate(results, start=1):
        rows.append((
            str(uuid.uuid4()),
            search_id,
            doc_id,
            str(getattr(result, "block_id")),
            query_text,
            rank,
            getattr(result, "text", "") or "",
            float(getattr(result, "score", 0.0) or 0.0),
            float(getattr(result, "cosine_score", 0.0) or 0.0),
            getattr(result, "page_number", None),
            getattr(result, "block_type", None),
            getattr(result, "x1", None),
            getattr(result, "y1", None),
            getattr(result, "x2", None),
            getattr(result, "y2", None),
        ))

    sql_text = """
    INSERT INTO search_results (
        result_id, search_id, doc_id, block_id, query_text, rank,
        answer_text, final_score, cosine_score, page_number, block_type,
        x1, y1, x2, y2
    )
    VALUES %s
    """

    conn = get_conn()
    if conn is None:
        raise Exception("Database connection failed in insert_search_results")

    try:
        with conn:
            ensure_search_results_table(conn)
            with conn.cursor() as cur:
                execute_values(cur, sql_text, rows, page_size=100)
    finally:
        conn.close()

    logger.info(
        "Inserted %d ranked search results for doc_id=%s search_id=%s",
        len(rows),
        doc_id,
        search_id,
    )
    return search_id
