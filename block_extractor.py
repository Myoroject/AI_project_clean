#!/usr/bin/env python3
"""
block_extractor.py

Geometry-aware document block extraction for AI Document Search.

Extracts text blocks from PDFs with full bounding box geometry and stores
them in the document_blocks table for spatial reranking and evidence-based citations.
"""

from __future__ import annotations
import os
import re
import uuid
import logging
import argparse
import datetime
from dataclasses import dataclass, asdict
from typing import List, Optional, Tuple

import fitz  # PyMuPDF
import psycopg2
from psycopg2.extras import execute_values

# -----------------------------------------------------------------------------
# Database connection (same pattern as semantic_chunker.py)
# -----------------------------------------------------------------------------
from app.db import get_conn

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("block_extractor")


# -----------------------------------------------------------------------------
# Data structures
# -----------------------------------------------------------------------------
@dataclass
class DocumentBlock:
    """
    A text block with full geometry information.
    
    Coordinates follow PDF convention:
    - Origin at top-left of page
    - x increases rightward
    - y increases downward
    """
    block_id: str
    doc_id: str
    page_number: int
    text: str
    
    # Raw bounding box
    x1: float  # left edge
    y1: float  # top edge
    x2: float  # right edge
    y2: float  # bottom edge
    
    # Derived geometry (computed once at ingestion)
    cx: float     # center x
    cy: float     # center y
    width: float
    height: float
    
    block_type: str
    parent_block_id: Optional[str] = None
    created_at: Optional[str] = None


# -----------------------------------------------------------------------------
# Block type classification heuristics
# -----------------------------------------------------------------------------
def classify_block_type(
    text: str,
    x1: float, y1: float, x2: float, y2: float,
    page_height: float,
    page_width: float
) -> str:
    """
    Classify block type using deterministic heuristics based on both text and geometry.
    Possible return types: empty, footer, header, numeric_value, table_cell, table, line, paragraph
    """
    text_stripped = text.strip()
    text_len = len(text_stripped)
    
    if text_len == 0:
        return "empty"
    
    # Lines and Geometry
    lines = text_stripped.split('\n')
    num_lines = len(lines)
    
    # Position on page (normalized 0-1)
    y_position = y1 / page_height if page_height > 0 else 0
    y_end_position = y2 / page_height if page_height > 0 else 0
    
    # 1. Footer detection: bottom 10% of page and short
    if y_position > 0.90 and text_len < 100 and num_lines <= 2:
        return "footer"
    
    # 2. Header detection: top 10% AND short text
    if y_end_position < 0.10 and text_len < 100 and num_lines <= 2:
        return "header"
    
    # 3. Title/Header (Uppercase) detection
    alpha_chars = [c for c in text_stripped if c.isalpha()]
    if alpha_chars and len(alpha_chars) < 100 and num_lines <= 2:
        upper_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
        # If it's short, mostly uppercase, and not at the very bottom
        if upper_ratio > 0.8 and y_position < 0.8:
            return "header"
            
    # 4. Numeric value detection: short, mostly digits (likely a wild table cell or chart label)
    if text_len < 50 and num_lines == 1:
        digit_count = sum(1 for c in text_stripped if c.isdigit())
        if text_len > 0 and digit_count / text_len > 0.5:
            return "numeric_value"
            
    # 5. Table detection (Multi-line with delimiters or highly structured columns)
    if num_lines >= 2:
        # Check for obvious delimiters
        delimiter_counts = [sum(1 for c in ln if c in '|,\t;') for ln in lines]
        
        # If most lines have delimiters, it's a table
        if sum(1 for d in delimiter_counts if d > 0) >= (num_lines * 0.5):
            return "table"
            
        # Check for numeric density across multiple lines (financial tables)
        numeric_lines = 0
        for ln in lines:
            ln_stripped = ln.strip()
            if not ln_stripped:
                continue
            chars = [c for c in ln_stripped if c.isalnum()]
            if chars:
                digits = sum(1 for c in chars if c.isdigit())
                if digits / len(chars) > 0.4:
                    numeric_lines += 1
                    
        if numeric_lines >= (num_lines * 0.5):
            return "table"

    # 6. Table Cell / List Item detection (Single line with high delimiter density)
    if num_lines == 1:
        delimiters = sum(1 for c in text_stripped if c in '|,\t;')
        if text_len > 0 and delimiters / text_len > 0.1:
            return "table_cell"
            
    # 7. Single Line / Short Sentence
    # If it's exactly one line, and isn't a header/footer/table cell, it's just a line of text.
    if num_lines == 1 and text_len < 150:
        return "line"
    
    # 8. Paragraph (Default fallback - multi-line text blocks)
    return "paragraph"


# -----------------------------------------------------------------------------
# PDF extraction with geometry
# -----------------------------------------------------------------------------
def extract_blocks_with_geometry(
    pdf_bytes: bytes,
    doc_id: str
) -> List[DocumentBlock]:
    """
    Extract text blocks from PDF with full bounding box geometry.
    """
    if not pdf_bytes:
        logger.warning("No PDF bytes provided")
        return []
    
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        logger.exception("Failed to open PDF: %s", e)
        return []
    
    blocks: List[DocumentBlock] = []
    now_iso = datetime.datetime.utcnow().isoformat()
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_height = page.rect.height
        page_width = page.rect.width
        
        try:
            raw_blocks = page.get_text("blocks")
        except Exception as e:
            logger.warning("Failed to extract blocks from page %d: %s", page_num, e)
            continue
        
        # Sort by reading order: top-to-bottom, left-to-right
        raw_blocks = sorted(raw_blocks, key=lambda b: (b[1], b[0]))
        
        for raw_block in raw_blocks:
            # Skip image blocks (block_type == 1)
            if len(raw_block) >= 7 and raw_block[6] == 1:
                continue
            
            x1, y1, x2, y2 = raw_block[0], raw_block[1], raw_block[2], raw_block[3]
            text = (raw_block[4] or "").strip() if len(raw_block) > 4 else ""
            
            if not text:
                continue
            
            # Compute derived geometry (O(1) per block)
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            width = x2 - x1
            height = y2 - y1
            
            # Classify block type
            block_type = classify_block_type(
                text, x1, y1, x2, y2, page_height, page_width
            )
            
            block = DocumentBlock(
                block_id=uuid.uuid4().hex,
                doc_id=doc_id,
                page_number=page_num + 1,  # 1-indexed for user display
                text=text,
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                cx=cx,
                cy=cy,
                width=width,
                height=height,
                block_type=block_type,
                parent_block_id=None,
                created_at=now_iso
            )
            blocks.append(block)
    
    page_count = len(doc)  # Store before closing
    doc.close()
    logger.info("Extracted %d blocks from %d pages for doc_id=%s", 
                len(blocks), page_count, doc_id)
    
    return blocks


def extract_blocks_from_pdf_path(
    pdf_path: str,
    doc_id: str
) -> List[DocumentBlock]:
    """Extract blocks from a PDF file path."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    
    return extract_blocks_with_geometry(pdf_bytes, doc_id)


# -----------------------------------------------------------------------------
# Database operations
# -----------------------------------------------------------------------------
def ensure_document_blocks_table(conn) -> None:
    """Create the document_blocks table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute("""
        CREATE EXTENSION IF NOT EXISTS vector;
        
        CREATE TABLE IF NOT EXISTS document_blocks (
            block_id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            page_number INT NOT NULL,
            text TEXT NOT NULL,
            x1 FLOAT NOT NULL,
            y1 FLOAT NOT NULL,
            x2 FLOAT NOT NULL,
            y2 FLOAT NOT NULL,
            cx FLOAT,
            cy FLOAT,
            width FLOAT,
            height FLOAT,
            block_type TEXT NOT NULL,
            parent_block_id TEXT NULL,
            embedding VECTOR(384),
            created_at TIMESTAMP DEFAULT NOW()
        );
        
        ALTER TABLE document_blocks ADD COLUMN IF NOT EXISTS embedding VECTOR(384);
        
        CREATE INDEX IF NOT EXISTS idx_blocks_embedding 
            ON document_blocks USING hnsw (embedding vector_cosine_ops);
        
        CREATE INDEX IF NOT EXISTS idx_blocks_doc_page 
            ON document_blocks (doc_id, page_number);
        
        CREATE INDEX IF NOT EXISTS idx_blocks_type 
            ON document_blocks (block_type);
        
        CREATE INDEX IF NOT EXISTS idx_blocks_parent 
            ON document_blocks (parent_block_id);
        """)
        conn.commit()
    logger.info("document_blocks table ensured")


def insert_document_blocks(blocks: List[DocumentBlock], conn=None) -> int:
    """
    Bulk insert document blocks into PostgreSQL.
    Returns: number of blocks inserted
    """
    if not blocks:
        return 0
    
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
    
    try:
        ensure_document_blocks_table(conn)
        
        cols = (
            "block_id", "doc_id", "page_number", "text",
            "x1", "y1", "x2", "y2",
            "cx", "cy", "width", "height",
            "block_type", "parent_block_id", "created_at"
        )
        
        values = []
        for b in blocks:
            values.append((
                b.block_id,
                b.doc_id,
                b.page_number,
                b.text,
                b.x1, b.y1, b.x2, b.y2,
                b.cx, b.cy, b.width, b.height,
                b.block_type,
                b.parent_block_id,
                b.created_at or datetime.datetime.utcnow().isoformat()
            ))
        
        with conn.cursor() as cur:
            execute_values(
                cur,
                f"""
                INSERT INTO document_blocks ({', '.join(cols)})
                VALUES %s
                ON CONFLICT (block_id) DO NOTHING
                """,
                values,
                page_size=100
            )
            conn.commit()
        
        logger.info("Inserted %d blocks for doc_id=%s", len(values), blocks[0].doc_id)
        return len(values)
    
    finally:
        if close_conn:
            conn.close()


def delete_blocks_for_document(doc_id: str, conn=None) -> int:
    """Delete all blocks for a document (for re-ingestion)."""
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
    
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_blocks WHERE doc_id = %s",
                (doc_id,)
            )
            deleted = cur.rowcount
            conn.commit()
        
        logger.info("Deleted %d blocks for doc_id=%s", deleted, doc_id)
        return deleted
    
    finally:
        if close_conn:
            conn.close()


# -----------------------------------------------------------------------------
# Top-K Block Retrieval
# -----------------------------------------------------------------------------
def get_blocks_for_document(
    doc_id: str,
    page_number: Optional[int] = None,
    block_types: Optional[List[str]] = None,
    conn=None
) -> List[DocumentBlock]:
    """Retrieve all blocks for a document, optionally filtered."""
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
    
    try:
        query = """
            SELECT block_id, doc_id, page_number, text,
                   x1, y1, x2, y2, cx, cy, width, height,
                   block_type, parent_block_id, created_at
            FROM document_blocks
            WHERE doc_id = %s
        """
        params = [doc_id]
        
        if page_number is not None:
            query += " AND page_number = %s"
            params.append(page_number)
        
        if block_types:
            placeholders = ','.join(['%s'] * len(block_types))
            query += f" AND block_type IN ({placeholders})"
            params.extend(block_types)
        
        query += " ORDER BY page_number, y1, x1"
        
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        
        blocks = []
        for row in rows:
            blocks.append(DocumentBlock(
                block_id=str(row[0]),
                doc_id=str(row[1]),
                page_number=row[2],
                text=row[3],
                x1=row[4], y1=row[5], x2=row[6], y2=row[7],
                cx=row[8], cy=row[9], width=row[10], height=row[11],
                block_type=row[12],
                parent_block_id=str(row[13]) if row[13] else None,
                created_at=str(row[14]) if row[14] else None
            ))
        
        return blocks
    
    finally:
        if close_conn:
            conn.close()


def get_top_k_blocks(
    doc_id: str,
    block_ids: List[str],
    k: int = 20, 
    conn=None
) -> List[DocumentBlock]:
    """Retrieve top-K blocks by ID for reranking after embedding search."""
    if not block_ids:
        return []
    
    block_ids = block_ids[:k]
    
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
    
    try:
        placeholders = ','.join(['%s'] * len(block_ids))
        query = f"""
            SELECT block_id, doc_id, page_number, text,
                   x1, y1, x2, y2, cx, cy, width, height,
                   block_type, parent_block_id, created_at
            FROM document_blocks
            WHERE doc_id = %s AND block_id IN ({placeholders})
        """
        
        with conn.cursor() as cur:
            cur.execute(query, [doc_id] + block_ids)
            rows = cur.fetchall()
        
        blocks = []
        for row in rows:
            blocks.append(DocumentBlock(
                block_id=str(row[0]),
                doc_id=str(row[1]),
                page_number=row[2],
                text=row[3],
                x1=row[4], y1=row[5], x2=row[6], y2=row[7],
                cx=row[8], cy=row[9], width=row[10], height=row[11],
                block_type=row[12],
                parent_block_id=str(row[13]) if row[13] else None,
                created_at=str(row[14]) if row[14] else None
            ))
        
        logger.info("Retrieved %d/%d blocks for doc_id=%s", len(blocks), k, doc_id)
        return blocks
    
    finally:
        if close_conn:
            conn.close()


def get_top_k_blocks_by_embedding(
    doc_id: str,
    query_emb: List[float],
    k: int = 20,
    conn=None
) -> Tuple[List[DocumentBlock], Dict[str, float]]:
    """Retrieve top-K visually-aware blocks using pgvector cosine search."""
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
        
    try:
        emb_str = "[" + ",".join(map(str, query_emb)) + "]"
        query = """
            SELECT block_id, doc_id, page_number, text,
                   x1, y1, x2, y2, cx, cy, width, height,
                   block_type, parent_block_id, created_at,
                   (1 - (embedding <=> %s::vector)) AS cosine_sim
            FROM document_blocks
            WHERE doc_id = %s AND embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        
        with conn.cursor() as cur:
            cur.execute(query, [emb_str, doc_id, emb_str, k])
            rows = cur.fetchall()
            
        blocks = []
        score_map = {}
        for row in rows:
            b_id = str(row[0])
            blocks.append(DocumentBlock(
                block_id=b_id, doc_id=str(row[1]), page_number=row[2], text=row[3],
                x1=row[4], y1=row[5], x2=row[6], y2=row[7],
                cx=row[8], cy=row[9], width=row[10], height=row[11],
                block_type=row[12], parent_block_id=str(row[13]) if row[13] else None,
                created_at=str(row[14]) if row[14] else None
            ))
            score_map[b_id] = float(row[15])
            
        return blocks, score_map
        
    finally:
        if close_conn:
            conn.close()


def get_same_row_blocks(
    doc_id: str,
    page_number: int,
    cy: float,
    tolerance: float = 10.0,
    conn=None
) -> List[DocumentBlock]:
    """Find blocks on the same row (similar cy value)."""
    close_conn = False
    if conn is None:
        conn = get_conn()
        close_conn = True
    
    try:
        query = """
            SELECT block_id, doc_id, page_number, text,
                   x1, y1, x2, y2, cx, cy, width, height,
                   block_type, parent_block_id, created_at
            FROM document_blocks
            WHERE doc_id = %s 
              AND page_number = %s
              AND ABS(cy - %s) <= %s
            ORDER BY x1
        """
        
        with conn.cursor() as cur:
            cur.execute(query, [doc_id, page_number, cy, tolerance])
            rows = cur.fetchall()
        
        blocks = []
        for row in rows:
            blocks.append(DocumentBlock(
                block_id=str(row[0]),
                doc_id=str(row[1]),
                page_number=row[2],
                text=row[3],
                x1=row[4], y1=row[5], x2=row[6], y2=row[7],
                cx=row[8], cy=row[9], width=row[10], height=row[11],
                block_type=row[12],
                parent_block_id=str(row[13]) if row[13] else None,
                created_at=str(row[14]) if row[14] else None
            ))
        
        return blocks
    
    finally:
        if close_conn:
            conn.close()


# -----------------------------------------------------------------------------
# Main entry point
# -----------------------------------------------------------------------------
def process_document(
    doc_id: str,
    pdf_bytes: Optional[bytes] = None,
    pdf_path: Optional[str] = None,
    replace_existing: bool = True,
    dry_run: bool = False
) -> List[DocumentBlock]:
    """
    Full pipeline: extract blocks from PDF and store in database.
    """
    # Extract blocks
    if pdf_bytes:
        blocks = extract_blocks_with_geometry(pdf_bytes, doc_id)
    elif pdf_path:
        blocks = extract_blocks_from_pdf_path(pdf_path, doc_id)
    else:
        raise ValueError("Either pdf_bytes or pdf_path must be provided")
    
    if not blocks:
        logger.warning("No blocks extracted for doc_id=%s", doc_id)
        return []
    
    # Log block type distribution
    type_counts = {}
    for b in blocks:
        type_counts[b.block_type] = type_counts.get(b.block_type, 0) + 1
    logger.info("Block types for doc_id=%s: %s", doc_id, type_counts)
    
    if dry_run:
        logger.info("Dry run - not persisting %d blocks", len(blocks))
        return blocks
    
    # Persist to database
    conn = get_conn()
    try:
        if replace_existing:
            delete_blocks_for_document(doc_id, conn)
        insert_document_blocks(blocks, conn)
    finally:
        conn.close()
    
    return blocks


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract document blocks with geometry from PDF"
    )
    parser.add_argument("--pdf", type=str, required=True, help="Path to PDF file")
    parser.add_argument("--doc_id", type=str, default=None, help="Document ID (auto-generated if not provided)")
    parser.add_argument("--dry_run", action="store_true", help="Extract but don't persist to database")
    parser.add_argument("--show_blocks", type=int, default=10, help="Number of blocks to display")
    
    args = parser.parse_args()
    
    doc_id = args.doc_id or uuid.uuid4().hex
    
    print(f"\n{'='*60}")
    print(f"Block Extractor - Geometry-aware PDF extraction")
    print(f"{'='*60}")
    print(f"PDF: {args.pdf}")
    print(f"Doc ID: {doc_id}")
    print(f"Dry run: {args.dry_run}")
    print(f"{'='*60}\n")
    
    blocks = process_document(
        doc_id=doc_id,
        pdf_path=args.pdf,
        dry_run=args.dry_run
    )
    
    print(f"\nExtracted {len(blocks)} blocks\n")
    
    # Show sample blocks
    for i, b in enumerate(blocks[:args.show_blocks]):
        print(f"[{i+1}] Page {b.page_number} | {b.block_type}")
        print(f"    Bbox: ({b.x1:.1f}, {b.y1:.1f}) - ({b.x2:.1f}, {b.y2:.1f})")
        print(f"    Center: ({b.cx:.1f}, {b.cy:.1f}) | Size: {b.width:.1f} x {b.height:.1f}")
        print(f"    Text: {b.text[:80]}{'...' if len(b.text) > 80 else ''}")
        print()
    
    if len(blocks) > args.show_blocks:
        print(f"... and {len(blocks) - args.show_blocks} more blocks")
