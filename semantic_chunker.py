#!/usr/bin/env python3
"""
semantic_chunker.py

Robust, production-oriented semantic chunker for research PDFs / long text.
"""

from __future__ import annotations
import os
import re
import json
import uuid
import logging
import argparse
import datetime
import unicodedata
from typing import List, Tuple, Optional, Any

# PDF extraction
import fitz  # PyMuPDF

# NLP
import spacy

# DB
import psycopg2
from psycopg2.extras import Json, execute_values

# try to import canonical helper from redis_client
try:
    from app.redis_client import get_doc_text
except Exception:
    def get_doc_text(doc_id: str) -> str:  # fallback
        return ""

# ----------------------------
# Config & constants
# ----------------------------
DEFAULT_PDF_PATH = os.getenv("DEFAULT_PDF_PATH", "./default.pdf")
SPACY_MODEL = os.getenv("SPACY_MODEL", "en_core_web_sm")

NUMERIC_DENSITY_THRESHOLD = 0.40
MIN_TABLE_LINES = 2
EQUATION_SYMBOLS = set("=+-*/∑∫√→<>⋅^_{}\\")
CAPTION_RE = re.compile(r"^\s*(Figure|Fig\.|Table)\s*\d+", re.I)

# Postgres envs (used only by helper get_pg_conn below)
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", 5432))
PGDATABASE = os.getenv("PGDATABASE", "postgres")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "yourpass")

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("semantic_chunker")

# ----------------------------
# Unicode cleaning helper
# ----------------------------
_SURROGATE_RE = re.compile(r'[\uD800-\uDFFF]')

def clean_text_for_spacy(text: Any, doc_id: Optional[str] = None, save_sample: bool = False) -> str:
    """
    Sanitize text so spaCy won't choke on isolated UTF-16 surrogates or bad bytes.
    - If bytes: decode with errors='replace'.
    - Replace surrogate codepoints with the unicode replacement char U+FFFD.
    - NFC-normalize.
    - Optionally save a short sample for inspection.
    """
    if text is None:
        return ""

    # decode bytes safely
    if isinstance(text, (bytes, bytearray)):
        try:
            text = text.decode("utf-8", errors="replace")
        except Exception:
            text = str(text)

    if not isinstance(text, str):
        text = str(text)

    if _SURROGATE_RE.search(text):
        logger.warning("Detected surrogate characters in text for doc_id=%s — replacing them", doc_id)
        cleaned = _SURROGATE_RE.sub("\uFFFD", text)
        if save_sample and doc_id:
            try:
                sample_path = os.path.join(".", f"debug_bad_unicode_{doc_id}.txt")
                with open(sample_path, "w", encoding="utf-8") as fh:
                    fh.write(cleaned[:4096])
                logger.info("Wrote unicode debug sample to %s", sample_path)
            except Exception:
                logger.exception("Failed to write unicode debug sample for doc_id=%s", doc_id)
        text = cleaned

    try:
        text = unicodedata.normalize("NFC", text)
    except Exception:
        pass
    return text

# ----------------------------
# Postgres helpers
# ----------------------------
def get_pg_conn():
    return psycopg2.connect(host=PGHOST, port=PGPORT, dbname=PGDATABASE, user=PGUSER, password=PGPASSWORD)

def ensure_chunks_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id TEXT PRIMARY KEY,
            doc_id TEXT,
            chunk_index INT,
            start_offset INT,
            end_offset INT,
            token_count INT,
            text_preview TEXT,
            redis_key TEXT,
            stored_bytes BIGINT,
            created_at TIMESTAMP,
            start_char INT,
            start_sentence INT,
            end_sentence INT,
            metadata JSONB,
            full_text TEXT
        );
        """)
        conn.commit()

# ----------------------------
# small helpers
# ----------------------------
def safe_uuid() -> str:
    return uuid.uuid4().hex

def now_iso() -> str:
    return datetime.datetime.utcnow().isoformat()

# ----------------------------
# insert chunks (conn-based)
# ----------------------------
from psycopg2.extras import Json as _Json  # local alias to avoid name shadowing

def insert_chunks_bulk(conn, chunk_dicts: List[dict]):
    """
    Bulk insert chunk records using an existing psycopg2 connection `conn`.
    Defensive: ensures required fields exist, converts None redis_key -> "".
    Commits the connection at the end.
    """
    if not chunk_dicts:
        return

    cols = (
        "chunk_id", "doc_id", "chunk_index", "start_offset", "end_offset",
        "token_count", "text_preview", "redis_key", "stored_bytes", "created_at",
        "start_char", "start_sentence", "end_sentence", "metadata", "full_text"
    )

    values = []
    for c in chunk_dicts:
        chunk_id = c.get("chunk_id") or safe_uuid()
        doc_id = c.get("doc_id")
        if not doc_id:
            logger.warning("Skipping chunk %s because missing doc_id", chunk_id)
            continue
        chunk_index = int(c.get("chunk_index", 0) or 0)
        start_offset = int(c.get("start_offset", 0) or 0)
        end_offset = int(c.get("end_offset", 0) or 0)
        token_count = int(c.get("token_count", 0) or 0)
        text_preview = (c.get("text_preview") or "")[:200]
        redis_key_val = c.get("redis_key") or ""
        # stored_bytes: guard encoding issues by using errors='replace'
        try:
            stored_bytes = int(c.get("stored_bytes", 0) or 0)
        except Exception:
            stored_bytes = len((c.get("text") or "").encode("utf-8", errors="replace"))
        created_at = c.get("created_at") or now_iso()
        start_char = int(c.get("start_char", 0) or 0)
        start_sentence = int(c.get("start_sentence", 0) or 0)
        end_sentence = int(c.get("end_sentence", 0) or 0)
        metadata = c.get("metadata") or {}
        full_text = c.get("text") or c.get("full_text") or None

        values.append((
            chunk_id, doc_id, chunk_index, start_offset, end_offset,
            token_count, text_preview, redis_key_val, stored_bytes, created_at,
            start_char, start_sentence, end_sentence, _Json(metadata), full_text
        ))

    if not values:
        logger.info("No valid chunk rows to insert.")
        return

    with conn.cursor() as cur:
        execute_values(
            cur,
            f"INSERT INTO chunks ({', '.join(cols)}) VALUES %s ON CONFLICT (chunk_id) DO NOTHING;",
            values,
            page_size=100
        )
        conn.commit()

    logger.info("Inserted %d chunks into DB.", len(values))

# ----------------------------
# PDF extraction
# ----------------------------
def extract_text_from_pdf(pdf_path: str) -> str:
    if not pdf_path:
        raise FileNotFoundError("No pdf_path provided")
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    doc = fitz.open(pdf_path)
    parts = []
    for pno in range(len(doc)):
        page = doc[pno]
        try:
            blocks = page.get_text("blocks")
        except Exception as e:
            logger.warning("fitz page.get_text('blocks') failed for page %d: %s. Trying fallback text()", pno, e)
            try:
                raw = page.get_text("text")
                if raw:
                    parts.append((raw.strip() + "\n\n"))
                continue
            except Exception as e2:
                logger.exception("Fallback extraction failed for page %d: %s", pno, e2)
                continue
        blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
        for b in blocks:
            text = (b[4] or "").strip()
            if text:
                parts.append(text + "\n\n")
    full_text = "".join(parts)
    logger.info("Extracted text from PDF: pages=%d chars=%d path=%s", len(doc), len(full_text), pdf_path)
    return full_text

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    if not pdf_bytes:
        return ""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")  # type: ignore
    except Exception as e:
        logger.exception("fitz failed to open pdf bytes: %s", e)
        return ""
    parts = []
    for pno in range(len(doc)):
        page = doc[pno]
        try:
            blocks = page.get_text("blocks")
        except Exception as e:
            logger.warning("fitz page.get_text('blocks') failed for page %d: %s. Trying fallback text()", pno, e)
            try:
                raw = page.get_text("text")
                if raw:
                    parts.append((raw.strip() + "\n\n"))
                continue
            except Exception as e2:
                logger.exception("Fallback extraction failed for page %d: %s", pno, e2)
                # optionally save the page image for manual inspection:
                try:
                    pix = page.get_pixmap()
                    outname = f"debug_page_{pno}.png"
                    pix.save(outname)
                    logger.info("Saved debug image for page %d to %s", pno, outname)
                except Exception:
                    pass
                continue
        blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
        for b in blocks:
            text = (b[4] or "").strip()
            if text:
                parts.append(text + "\n\n")
    full_text = "".join(parts)
    logger.info("Extracted text from PDF bytes: pages=%d chars=%d", len(doc), len(full_text))
    return full_text

# ----------------------------
# heuristics
# ----------------------------
def is_numeric_density_high(line: str) -> bool:
    tokens = re.split(r"\s+", line.strip())
    if not tokens:
        return False
    num = sum(1 for t in tokens if re.search(r"\d", t))
    return (num / len(tokens)) >= NUMERIC_DENSITY_THRESHOLD

def looks_like_table(lines: List[str]) -> bool:
    if len(lines) < MIN_TABLE_LINES:
        return False
    delim_count = 0
    numeric_count = 0
    for ln in lines:
        delim_count += sum(1 for ch in ln if ch in "|,\t;")
        if is_numeric_density_high(ln):
            numeric_count += 1
    avg_delim = delim_count / max(1, len(lines))
    frac_numeric = numeric_count / len(lines)
    return (avg_delim >= 1.0) or (frac_numeric >= 0.5)

def looks_like_equation(text: str) -> bool:
    math_sym_count = sum(1 for ch in text if ch in EQUATION_SYMBOLS)
    if math_sym_count >= 2:
        return True
    if re.search(r"\(\s*\d+\s*\)\s*$", text):
        return True
    nonalpha = sum(1 for ch in text if not ch.isalnum() and not ch.isspace())
    if len(text) > 0 and (nonalpha / len(text) > 0.15) and len(text) < 300:
        return True
    return False

def looks_like_caption(text: str) -> bool:
    return bool(CAPTION_RE.search(text))

# ----------------------------
# blocks & sentences
# ----------------------------
def detect_blocks_from_text(full_text: str) -> List[dict]:
    lines = full_text.splitlines(keepends=True)
    blocks = []
    current_lines = []
    current_start = 0
    cursor = 0
    for ln in lines:
        ln_len = len(ln)
        ln_stripped = ln.strip()
        if ln_stripped == "":
            if current_lines:
                block_text = "".join(current_lines)
                blocks.append({"start_char": current_start, "end_char": cursor, "text": block_text})
                current_lines = []
            cursor += ln_len
            current_start = cursor
            continue
        if not current_lines:
            current_start = cursor
        current_lines.append(ln)
        cursor += ln_len
    if current_lines:
        blocks.append({"start_char": current_start, "end_char": cursor, "text": "".join(current_lines)})
    logger.debug("detect_blocks_from_text -> %d blocks", len(blocks))
    return blocks

def tag_block_types(blocks: List[dict]) -> List[dict]:
    for b in blocks:
        txt = b["text"].strip()
        lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
        if lines and looks_like_caption(lines[0]):
            b["block_type"] = "figure_caption"
            continue
        if any(looks_like_equation(ln) for ln in lines):
            b["block_type"] = "equation"
            continue
        if looks_like_table(lines):
            b["block_type"] = "table"
            continue
        if len(lines) > 0 and (sum(1 for ln in lines if is_numeric_density_high(ln)) / max(1, len(lines)) >= 0.5):
            b["block_type"] = "numeric_table"
            continue
        b["block_type"] = "text"
    return blocks

def build_sentence_spans(nlp, full_text: str) -> Tuple[List[Tuple[int,int]], object]:
    doc = nlp(full_text)
    spans = [(sent.start_char, sent.end_char) for sent in doc.sents]
    return spans, doc

def find_sentence_span_for_range(span_list: List[Tuple[int,int]], start_char: int, end_char: int) -> Tuple[int,int]:
    n = len(span_list)
    if n == 0:
        return 0, 0
    s_idx = 0
    for i,(s,e) in enumerate(span_list):
        if e > start_char:
            s_idx = i
            break
    e_idx = n-1
    for j in range(n-1, -1, -1):
        s,e = span_list[j]
        if s < end_char:
            e_idx = j
            break
    s_idx = max(0, min(s_idx, n-1))
    e_idx = max(0, min(e_idx, n-1))
    return s_idx, e_idx

def build_overlapping_windows(span_list: List[Tuple[int,int]], window_size:int=3, buffer_size:int=1) -> List[Tuple[int,int]]:
    windows = []
    n = len(span_list)
    if n == 0:
        return windows
    step = window_size - buffer_size
    if step <= 0:
        raise ValueError("window_size must be larger than buffer_size")
    i = 0
    while i < n:
        start = i
        end = min(i + window_size - 1, n - 1)
        windows.append((start, end))
        i += step
    return windows

# ----------------------------
# main entrypoint
# ----------------------------
def build_chunks_from_redis(doc_id: str,
                            redis_client: Optional[Any] = None,
                            pdf_path: Optional[str] = None,
                            pdf_bytes: Optional[bytes] = None,
                            nlp=None,
                            window_size:int=3,
                            buffer_size:int=1,
                            dry_run:bool=False) -> List[dict]:
    """
    Text acquisition order:
      1) get_doc_text(doc_id) from app.redis_client (canonical)
      2) provided redis_client (if any)
      3) pdf_bytes (if passed programmatically)
      4) pdf_path arg
      5) LOCAL_PDF_FALLBACK env var
      6) DEFAULT_PDF_PATH or probe local files
    """
    logger.info("semantic_chunker: start for doc_id=%s", doc_id)

    text = ""

    # 1) canonical get_doc_text (this obtains text from Redis or DOC_STORE fallback in redis_client)
    try:
        text = get_doc_text(doc_id) or ""
        if text:
            logger.info("Loaded text for doc_id=%s via get_doc_text (len=%d)", doc_id, len(text))
    except Exception as e:
        logger.warning("get_doc_text(doc_id=%s) raised: %s", doc_id, e)
        text = ""

    # 2) try provided redis_client (best-effort) - only if no text yet
    if not text and redis_client is not None:
        try:
            raw = redis_client.get(f"doc:{doc_id}")
            if raw:
                try:
                    text = raw.decode("utf-8")
                except Exception:
                    text = raw.decode("latin-1")
                logger.info("Loaded text from provided redis_client single-key for doc_id=%s", doc_id)
            else:
                meta_raw = redis_client.get(f"doc:{doc_id}:meta")
                if meta_raw:
                    try:
                        meta = json.loads(meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes,bytearray)) else str(meta_raw))
                    except Exception:
                        meta = None
                    if meta and "chunks" in meta:
                        pieces = []
                        total_bytes = 0
                        for i in range(int(meta.get("chunks", 0))):
                            ckey = f"doc:{doc_id}:chunk:{i}"
                            v = redis_client.get(ckey)
                            if not v:
                                continue
                            try:
                                pieces.append(v.decode("utf-8"))
                            except Exception:
                                pieces.append(v.decode("latin-1"))
                            total_bytes += len(v)
                        text = "".join(pieces)
                        logger.info("Loaded text from provided redis_client chunks for doc_id=%s bytes=%d chunks=%d", doc_id, total_bytes, len(pieces))
        except Exception as e:
            logger.warning("Provided redis_client fetch failed for doc_id=%s: %s", doc_id, e)

    # 3) If programmatic pdf bytes were passed, extract text from bytes (no disk)
    if not text and pdf_bytes:
        try:
            text = extract_text_from_pdf_bytes(pdf_bytes)
            if text:
                logger.info("Loaded text for doc_id=%s via pdf_bytes (len=%d)", doc_id, len(text))
        except Exception as e:
            logger.exception("Failed to extract text from pdf_bytes for doc_id=%s: %s", doc_id, e)

    # 4) Robust PDF path fallbacks
    if not text:
        chosen_pdf = None
        if pdf_path and os.path.exists(pdf_path):
            chosen_pdf = pdf_path
        elif os.getenv("LOCAL_PDF_FALLBACK") and os.path.exists(os.getenv("LOCAL_PDF_FALLBACK")):
            chosen_pdf = os.getenv("LOCAL_PDF_FALLBACK")
        elif DEFAULT_PDF_PATH and os.path.exists(DEFAULT_PDF_PATH):
            chosen_pdf = DEFAULT_PDF_PATH
        else:
            probes = [
                os.path.join(".", "uploads", f"{doc_id}.pdf"),
                os.path.join(".", "data", f"{doc_id}.pdf"),
                os.path.join(".", f"{doc_id}.pdf"),
            ]
            for p in probes:
                if os.path.exists(p):
                    chosen_pdf = p
                    break

        if chosen_pdf:
            try:
                text = extract_text_from_pdf(chosen_pdf)
                logger.info("Loaded text from fallback PDF for doc_id=%s path=%s", doc_id, chosen_pdf)
            except Exception as e:
                logger.exception("Failed to extract text from fallback PDF %s: %s", chosen_pdf, e)
                text = ""
        else:
            logger.error(
                "No usable PDF fallback for doc_id=%s. Set LOCAL_PDF_FALLBACK, DEFAULT_PDF_PATH, pass pdf_path or pdf_bytes.",
                doc_id
            )
            text = ""

    if not text:
        logger.warning("No text available for doc_id=%s - returning empty chunk list", doc_id)
        return []

    # 5) Clean text for spaCy (handle invalid unicode/surrogates)
    try:
        text = clean_text_for_spacy(text, doc_id=doc_id, save_sample=True)
    except Exception as e:
        logger.warning("clean_text_for_spacy failed for doc_id=%s: %s", doc_id, e)
        text = str(text)

    # 6) Load spaCy if needed
    if nlp is None:
        try:
            nlp = spacy.load(SPACY_MODEL, disable=["ner", "textcat"])
        except Exception as e:
            logger.error("spaCy model '%s' not found. Install with: python -m spacy download %s", SPACY_MODEL, SPACY_MODEL)
            raise
        if "parser" not in nlp.pipe_names and "senter" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")

    # 7) Detect blocks and tag them
    blocks = detect_blocks_from_text(text)
    blocks = tag_block_types(blocks)

    # 8) Sentence spans
    sent_spans, doc_obj = build_sentence_spans(nlp, text)
    logger.info("Document has %d sentences and %d blocks", len(sent_spans), len(blocks))

    # 9) Build overlapping windows metadata
    windows = build_overlapping_windows(sent_spans, window_size=window_size, buffer_size=buffer_size)

    # 10) Map blocks -> sentences -> chunk dicts
    chunk_dicts: List[dict] = []
    for idx, b in enumerate(blocks):
        s_char = b["start_char"]
        e_char = b["end_char"]
        start_sent, end_sent = find_sentence_span_for_range(sent_spans, s_char, e_char)
        chunk_text = text[s_char:e_char].strip() if e_char > s_char else ""
        token_count = len([tok for tok in nlp(chunk_text)]) if chunk_text else 0
        rec = {
            "chunk_id": safe_uuid(),
            "doc_id": doc_id,
            "chunk_index": idx,
            "start_offset": 0,
            "end_offset": 0,
            "token_count": token_count,
            "text_preview": chunk_text[:200],
            "redis_key": "",  # never None
            "stored_bytes": len(chunk_text.encode("utf-8", errors="replace")),
            "created_at": now_iso(),
            "start_char": s_char,
            "start_sentence": start_sent,
            "end_sentence": end_sent,
            "metadata": {
                "block_type": b.get("block_type"),
                "window_size": window_size,
                "buffer_size": buffer_size,
                "window_count": len(windows)
            },
            "text": chunk_text
        }
        chunk_dicts.append(rec)

    logger.info("Built %d chunk dicts for doc_id=%s", len(chunk_dicts), doc_id)

    # 11) Persist unless dry_run True
    if not dry_run:
        conn = get_pg_conn()
        try:
            ensure_chunks_table(conn)
            insert_chunks_bulk(conn, chunk_dicts)
            logger.info("Persisted %d chunks to DB for doc_id=%s", len(chunk_dicts), doc_id)
        finally:
            conn.close()
    else:
        logger.info("Dry run enabled - not writing to DB. Returning chunk dicts.")

    return chunk_dicts

# ----------------------------
# CLI for quick testing
# ----------------------------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--pdf", type=str, default=None, help="Explicit PDF path fallback")
    p.add_argument("--doc_id", type=str, default="local_doc", help="doc id to use for tests")
    p.add_argument("--dry_run", action="store_true", help="Don't write to DB")
    p.add_argument("--window_size", type=int, default=3)
    p.add_argument("--buffer_size", type=int, default=1)
    args = p.parse_args()

    chunks = build_chunks_from_redis(
        doc_id=args.doc_id,
        redis_client=None,
        pdf_path=args.pdf,
        pdf_bytes=None,
        nlp=None,
        window_size=args.window_size,
        buffer_size=args.buffer_size,
        dry_run=args.dry_run
    )

    print(f"Built {len(chunks)} chunks (dry_run={args.dry_run}) for doc_id={args.doc_id}")
    for c in chunks[:8]:
        print(json.dumps({
            "chunk_id": c["chunk_id"],
            "chunk_index": c["chunk_index"],
            "token_count": c["token_count"],
            "text_preview": c["text_preview"],
            "start_sentence": c["start_sentence"],
            "end_sentence": c["end_sentence"],
            "metadata": c["metadata"]
        }, indent=2))
