from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from psycopg2.extras import Json, RealDictCursor, execute_values

from app.db import get_conn
from app.ingest_db import get_document, update_document_status

logger = logging.getLogger("table_store")


def ensure_table_pipeline_tables(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE EXTENSION IF NOT EXISTS vector;

            CREATE TABLE IF NOT EXISTS document_tables (
                table_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                page_number INT NOT NULL,
                table_index INT NOT NULL,
                block_type TEXT NOT NULL DEFAULT 'table',
                caption_text TEXT,
                heading_text TEXT,
                context_text TEXT,
                raw_markdown TEXT NOT NULL,
                highlighted_row_text TEXT,
                cell_matrix JSONB NOT NULL,
                normalized_matrix JSONB,
                row_count INT NOT NULL,
                column_count INT NOT NULL,
                empty_cell_ratio DOUBLE PRECISION,
                detection_confidence DOUBLE PRECISION,
                extraction_status TEXT NOT NULL DEFAULT 'extracted',
                extractor TEXT,
                bbox_x1 DOUBLE PRECISION,
                bbox_y1 DOUBLE PRECISION,
                bbox_x2 DOUBLE PRECISION,
                bbox_y2 DOUBLE PRECISION,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_document_tables_doc_page
                ON document_tables (doc_id, page_number, table_index);

            CREATE TABLE IF NOT EXISTS table_page_detections (
                detection_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                page_number INT NOT NULL,
                confidence DOUBLE PRECISION NOT NULL,
                detected BOOLEAN NOT NULL,
                detector_version TEXT,
                features JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_table_page_detections_doc_page
                ON table_page_detections (doc_id, page_number);

            CREATE TABLE IF NOT EXISTS table_extraction_failures (
                failure_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                page_number INT,
                table_id TEXT,
                extractor TEXT,
                error_type TEXT,
                error_message TEXT,
                detection_confidence DOUBLE PRECISION,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_table_failures_doc_page
                ON table_extraction_failures (doc_id, page_number, created_at DESC);

            CREATE TABLE IF NOT EXISTS embeddings (
                embedding_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                parent_entity_id TEXT,
                block_id TEXT,
                table_id TEXT,
                visual_id TEXT,
                row_index INT,
                page_number INT,
                block_type TEXT NOT NULL,
                content_text TEXT NOT NULL,
                metadata JSONB,
                embedding VECTOR(384),
                created_at TIMESTAMP DEFAULT NOW()
            );

            ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS block_id TEXT;
            ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS table_id TEXT;
            ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS visual_id TEXT;
            ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS row_index INT;

            CREATE INDEX IF NOT EXISTS idx_embeddings_entity
                ON embeddings (doc_id, entity_type, entity_id);

            CREATE INDEX IF NOT EXISTS idx_embeddings_parent
                ON embeddings (doc_id, parent_entity_id);

            CREATE INDEX IF NOT EXISTS idx_embeddings_block_id
                ON embeddings (doc_id, block_id);

            CREATE INDEX IF NOT EXISTS idx_embeddings_table_id
                ON embeddings (doc_id, table_id);

            CREATE INDEX IF NOT EXISTS idx_embeddings_visual_id
                ON embeddings (doc_id, visual_id);

            CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
                ON embeddings USING hnsw (embedding vector_cosine_ops);

            CREATE TABLE IF NOT EXISTS document_processing_jobs (
                job_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                job_type TEXT NOT NULL,
                payload JSONB,
                required BOOLEAN NOT NULL DEFAULT FALSE,
                status TEXT NOT NULL DEFAULT 'queued',
                attempts INT NOT NULL DEFAULT 0,
                last_error TEXT,
                locked_at TIMESTAMP,
                locked_by TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_processing_jobs_status
                ON document_processing_jobs (status, created_at);

            CREATE INDEX IF NOT EXISTS idx_processing_jobs_doc
                ON document_processing_jobs (doc_id, created_at);

            CREATE TABLE IF NOT EXISTS document_visuals (
                visual_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                page_number INT NOT NULL,
                visual_index INT NOT NULL,
                block_type TEXT NOT NULL DEFAULT 'image',
                detector_strategy TEXT,
                ocr_strategy TEXT,
                summary_strategy TEXT,
                source_kind TEXT,
                bbox_x1 DOUBLE PRECISION,
                bbox_y1 DOUBLE PRECISION,
                bbox_x2 DOUBLE PRECISION,
                bbox_y2 DOUBLE PRECISION,
                image_area_ratio DOUBLE PRECISION,
                ocr_text TEXT,
                ocr_lines JSONB,
                visual_summary TEXT,
                structured_data JSONB,
                confidence_score DOUBLE PRECISION,
                extraction_status TEXT NOT NULL DEFAULT 'detected',
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_document_visuals_doc_page
                ON document_visuals (doc_id, page_number, visual_index);

            CREATE INDEX IF NOT EXISTS idx_document_visuals_block_type
                ON document_visuals (doc_id, block_type);

            CREATE TABLE IF NOT EXISTS visual_processing_failures (
                failure_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                page_number INT,
                visual_id TEXT,
                stage TEXT,
                processor TEXT,
                error_type TEXT,
                error_message TEXT,
                confidence_score DOUBLE PRECISION,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_visual_failures_doc_page
                ON visual_processing_failures (doc_id, page_number, created_at DESC);
            """
        )
        conn.commit()


def _with_conn(fn, *args, **kwargs):
    conn = get_conn()
    try:
        ensure_table_pipeline_tables(conn)
        return fn(conn, *args, **kwargs)
    finally:
        conn.close()


def delete_embeddings_for_document(doc_id: str, entity_types: Optional[List[str]] = None) -> None:
    def _delete(conn):
        with conn.cursor() as cur:
            if entity_types:
                placeholders = ",".join(["%s"] * len(entity_types))
                cur.execute(
                    f"DELETE FROM embeddings WHERE doc_id = %s AND entity_type IN ({placeholders})",
                    [doc_id] + entity_types,
                )
            else:
                cur.execute("DELETE FROM embeddings WHERE doc_id = %s", (doc_id,))
            conn.commit()

    _with_conn(_delete)


def delete_embeddings_for_visual(doc_id: str, visual_id: str, entity_types: Optional[List[str]] = None) -> None:
    def _delete(conn):
        with conn.cursor() as cur:
            if entity_types:
                placeholders = ",".join(["%s"] * len(entity_types))
                cur.execute(
                    f"""
                    DELETE FROM embeddings
                    WHERE doc_id = %s AND visual_id = %s AND entity_type IN ({placeholders})
                    """,
                    [doc_id, visual_id] + entity_types,
                )
            else:
                cur.execute(
                    "DELETE FROM embeddings WHERE doc_id = %s AND visual_id = %s",
                    (doc_id, visual_id),
                )
            conn.commit()

    _with_conn(_delete)


def insert_embeddings(records: List[Dict[str, Any]]) -> int:
    if not records:
        return 0

    def _insert(conn):
        rows = []
        for record in records:
            rows.append(
                (
                    record.get("embedding_id") or str(uuid.uuid4()),
                    record["doc_id"],
                    record["entity_type"],
                    record["entity_id"],
                    record.get("parent_entity_id"),
                    record.get("block_id"),
                    record.get("table_id"),
                    record.get("visual_id"),
                    record.get("row_index"),
                    record.get("page_number"),
                    record.get("block_type", "paragraph"),
                    record.get("content_text", ""),
                    Json(record.get("metadata") or {}),
                    record.get("embedding"),
                )
            )

        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO embeddings (
                    embedding_id, doc_id, entity_type, entity_id, parent_entity_id,
                    block_id, table_id, visual_id, row_index, page_number,
                    block_type, content_text, metadata, embedding
                )
                VALUES %s
                """,
                rows,
                template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)",
                page_size=100,
            )
            conn.commit()
        return len(rows)

    return _with_conn(_insert)


def insert_table_page_detections(doc_id: str, detections: List[Dict[str, Any]]) -> int:
    if not detections:
        return 0

    def _insert(conn):
        with conn.cursor() as cur:
            cur.execute("DELETE FROM table_page_detections WHERE doc_id = %s", (doc_id,))
            rows = [
                (
                    d.get("detection_id") or str(uuid.uuid4()),
                    doc_id,
                    d["page_number"],
                    float(d["confidence"]),
                    bool(d["detected"]),
                    d.get("detector_version"),
                    Json(d.get("features") or {}),
                )
                for d in detections
            ]
            execute_values(
                cur,
                """
                INSERT INTO table_page_detections (
                    detection_id, doc_id, page_number, confidence,
                    detected, detector_version, features
                )
                VALUES %s
                """,
                rows,
                page_size=100,
            )
            conn.commit()
        return len(rows)

    return _with_conn(_insert)


def insert_table_failure(
    doc_id: str,
    page_number: Optional[int],
    extractor: str,
    error_type: str,
    error_message: str,
    detection_confidence: Optional[float] = None,
    metadata: Optional[Dict[str, Any]] = None,
    table_id: Optional[str] = None,
) -> str:
    def _insert(conn):
        failure_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO table_extraction_failures (
                    failure_id, doc_id, page_number, table_id, extractor,
                    error_type, error_message, detection_confidence, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    failure_id,
                    doc_id,
                    page_number,
                    table_id,
                    extractor,
                    error_type,
                    error_message[:4000],
                    detection_confidence,
                    Json(metadata or {}),
                ),
            )
            conn.commit()
        return failure_id

    return _with_conn(_insert)


def delete_tables_for_document(doc_id: str) -> None:
    def _delete(conn):
        with conn.cursor() as cur:
            cur.execute("DELETE FROM document_tables WHERE doc_id = %s", (doc_id,))
            conn.commit()

    _with_conn(_delete)


def delete_visuals_for_document(doc_id: str) -> None:
    def _delete(conn):
        with conn.cursor() as cur:
            cur.execute("DELETE FROM document_visuals WHERE doc_id = %s", (doc_id,))
            conn.commit()

    _with_conn(_delete)


def insert_document_tables(tables: List[Dict[str, Any]]) -> int:
    if not tables:
        return 0

    def _insert(conn):
        rows = []
        for table in tables:
            rows.append(
                (
                    table.get("table_id") or str(uuid.uuid4()),
                    table["doc_id"],
                    table["page_number"],
                    table["table_index"],
                    table.get("block_type", "table"),
                    table.get("caption_text"),
                    table.get("heading_text"),
                    table.get("context_text"),
                    table["raw_markdown"],
                    table.get("highlighted_row_text"),
                    Json(table["cell_matrix"]),
                    Json(table.get("normalized_matrix")),
                    table["row_count"],
                    table["column_count"],
                    table.get("empty_cell_ratio"),
                    table.get("detection_confidence"),
                    table.get("extraction_status", "extracted"),
                    table.get("extractor"),
                    table.get("bbox_x1"),
                    table.get("bbox_y1"),
                    table.get("bbox_x2"),
                    table.get("bbox_y2"),
                    Json(table.get("metadata") or {}),
                )
            )

        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO document_tables (
                    table_id, doc_id, page_number, table_index, block_type,
                    caption_text, heading_text, context_text, raw_markdown,
                    highlighted_row_text, cell_matrix, normalized_matrix,
                    row_count, column_count, empty_cell_ratio, detection_confidence,
                    extraction_status, extractor, bbox_x1, bbox_y1, bbox_x2, bbox_y2,
                    metadata
                )
                VALUES %s
                """,
                rows,
                page_size=100,
            )
            conn.commit()
        return len(rows)

    return _with_conn(_insert)


def get_document_table(table_id: str) -> Optional[Dict[str, Any]]:
    def _get(conn):
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM document_tables WHERE table_id = %s", (table_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    return _with_conn(_get)


def insert_document_visuals(visuals: List[Dict[str, Any]]) -> int:
    if not visuals:
        return 0

    def _insert(conn):
        rows = []
        for visual in visuals:
            rows.append(
                (
                    visual.get("visual_id") or str(uuid.uuid4()),
                    visual["doc_id"],
                    visual["page_number"],
                    visual["visual_index"],
                    visual.get("block_type", "image"),
                    visual.get("detector_strategy"),
                    visual.get("ocr_strategy"),
                    visual.get("summary_strategy"),
                    visual.get("source_kind"),
                    visual.get("bbox_x1"),
                    visual.get("bbox_y1"),
                    visual.get("bbox_x2"),
                    visual.get("bbox_y2"),
                    visual.get("image_area_ratio"),
                    visual.get("ocr_text"),
                    Json(visual.get("ocr_lines")),
                    visual.get("visual_summary"),
                    Json(visual.get("structured_data")),
                    visual.get("confidence_score"),
                    visual.get("extraction_status", "detected"),
                    Json(visual.get("metadata") or {}),
                )
            )

        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO document_visuals (
                    visual_id, doc_id, page_number, visual_index, block_type,
                    detector_strategy, ocr_strategy, summary_strategy, source_kind,
                    bbox_x1, bbox_y1, bbox_x2, bbox_y2, image_area_ratio,
                    ocr_text, ocr_lines, visual_summary, structured_data,
                    confidence_score, extraction_status, metadata
                )
                VALUES %s
                """,
                rows,
                page_size=100,
            )
            conn.commit()
        return len(rows)

    return _with_conn(_insert)


def get_document_visual(visual_id: str) -> Optional[Dict[str, Any]]:
    def _get(conn):
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM document_visuals WHERE visual_id = %s", (visual_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    return _with_conn(_get)


def update_document_visual(
    visual_id: str,
    *,
    block_type: Optional[str] = None,
    ocr_strategy: Optional[str] = None,
    summary_strategy: Optional[str] = None,
    ocr_text: Optional[str] = None,
    ocr_lines: Optional[List[str]] = None,
    visual_summary: Optional[str] = None,
    structured_data: Optional[Dict[str, Any]] = None,
    confidence_score: Optional[float] = None,
    extraction_status: Optional[str] = None,
    metadata_merge: Optional[Dict[str, Any]] = None,
) -> None:
    def _update(conn):
        set_clauses = ["updated_at = NOW()"]
        params: List[Any] = []

        if block_type is not None:
            set_clauses.append("block_type = %s")
            params.append(block_type)
        if ocr_strategy is not None:
            set_clauses.append("ocr_strategy = %s")
            params.append(ocr_strategy)
        if summary_strategy is not None:
            set_clauses.append("summary_strategy = %s")
            params.append(summary_strategy)
        if ocr_text is not None:
            set_clauses.append("ocr_text = %s")
            params.append(ocr_text)
        if ocr_lines is not None:
            set_clauses.append("ocr_lines = %s")
            params.append(Json(ocr_lines))
        if visual_summary is not None:
            set_clauses.append("visual_summary = %s")
            params.append(visual_summary)
        if structured_data is not None:
            set_clauses.append("structured_data = %s")
            params.append(Json(structured_data))
        if confidence_score is not None:
            set_clauses.append("confidence_score = %s")
            params.append(confidence_score)
        if extraction_status is not None:
            set_clauses.append("extraction_status = %s")
            params.append(extraction_status)
        if metadata_merge:
            set_clauses.append("metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb")
            params.append(Json(metadata_merge))

        params.append(visual_id)

        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE document_visuals SET {', '.join(set_clauses)} WHERE visual_id = %s",
                params,
            )
            conn.commit()

    _with_conn(_update)


def insert_visual_failure(
    doc_id: str,
    page_number: Optional[int],
    *,
    stage: str,
    processor: str,
    error_type: str,
    error_message: str,
    confidence_score: Optional[float] = None,
    metadata: Optional[Dict[str, Any]] = None,
    visual_id: Optional[str] = None,
) -> str:
    def _insert(conn):
        failure_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO visual_processing_failures (
                    failure_id, doc_id, page_number, visual_id, stage, processor,
                    error_type, error_message, confidence_score, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    failure_id,
                    doc_id,
                    page_number,
                    visual_id,
                    stage,
                    processor,
                    error_type,
                    error_message[:4000],
                    confidence_score,
                    Json(metadata or {}),
                ),
            )
            conn.commit()
        return failure_id

    return _with_conn(_insert)


def get_embedding_candidates(doc_id: str, query_vector: List[float], k: int) -> List[Dict[str, Any]]:
    emb_str = "[" + ",".join(map(str, query_vector)) + "]"

    def _get(conn):
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT embedding_id, doc_id, entity_type, entity_id, parent_entity_id,
                       block_id, table_id, visual_id, row_index,
                       page_number, block_type, content_text, metadata,
                       (1 - (embedding <=> %s::vector)) AS cosine_sim
                FROM embeddings
                WHERE doc_id = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (emb_str, doc_id, emb_str, k),
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]

    return _with_conn(_get)


def enqueue_processing_job(
    doc_id: str,
    job_type: str,
    payload: Optional[Dict[str, Any]] = None,
    required: bool = False,
) -> str:
    def _insert(conn):
        job_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO document_processing_jobs (
                    job_id, doc_id, job_type, payload, required, status, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, 'queued', NOW(), NOW())
                """,
                (job_id, doc_id, job_type, Json(payload or {}), required),
            )
            conn.commit()
        return job_id

    return _with_conn(_insert)


def claim_processing_job(worker_id: str) -> Optional[Dict[str, Any]]:
    def _claim(conn):
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                WITH next_job AS (
                    SELECT job_id
                    FROM document_processing_jobs
                    WHERE status = 'queued'
                    ORDER BY created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE document_processing_jobs jobs
                SET status = 'running',
                    attempts = attempts + 1,
                    locked_at = NOW(),
                    locked_by = %s,
                    updated_at = NOW()
                FROM next_job
                WHERE jobs.job_id = next_job.job_id
                RETURNING jobs.*
                """,
                (worker_id,),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None

    return _with_conn(_claim)


def complete_processing_job(job_id: str) -> None:
    def _complete(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE document_processing_jobs
                SET status = 'completed',
                    updated_at = NOW()
                WHERE job_id = %s
                """,
                (job_id,),
            )
            conn.commit()

    _with_conn(_complete)


def fail_processing_job(job_id: str, error_message: str) -> None:
    def _fail(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE document_processing_jobs
                SET status = 'failed',
                    last_error = %s,
                    updated_at = NOW()
                WHERE job_id = %s
                """,
                (error_message[:4000], job_id),
            )
            conn.commit()

    _with_conn(_fail)


def refresh_document_status(doc_id: str) -> None:
    def _refresh(conn):
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status IN ('queued', 'running')) AS pending_jobs,
                    COUNT(*) FILTER (WHERE required = TRUE AND status IN ('queued', 'running')) AS pending_required,
                    COUNT(*) FILTER (WHERE required = TRUE AND status = 'failed') AS failed_required
                FROM document_processing_jobs
                WHERE doc_id = %s
                """,
                (doc_id,),
            )
            row = cur.fetchone() or {}

        pending_jobs = int(row.get("pending_jobs") or 0)
        pending_required = int(row.get("pending_required") or 0)
        failed_required = int(row.get("failed_required") or 0)

        if failed_required > 0:
            update_document_status(doc_id, "error")
        elif pending_jobs > 0 or pending_required > 0:
            update_document_status(doc_id, "processing")
        else:
            update_document_status(doc_id, "ready")

    _with_conn(_refresh)


def get_document_filename(doc_id: str) -> str:
    doc = get_document(doc_id) or {}
    return str(doc.get("filename") or "")
