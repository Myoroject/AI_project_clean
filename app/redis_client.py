# app/redis_client.py
"""
Redis client for AI Document Search.

Features:
- put_doc_text(doc_id, text): store document text (single-key or chunked, gzip compress when helpful)
- put_doc_binary(doc_id, blob, kind): store raw binary payloads for async processors
- get_doc_text(doc_id): reassemble and return unicode text safely (errors='replace')
- clear_doc(doc_id): remove keys
- redis_healthy(): ping Redis
- legacy build_chunks_from_redis wrapper that delegates to semantic_chunker (if present)
"""

from __future__ import annotations
import os
import time
import json
import math
import gzip
import logging
from typing import Dict, Tuple, List, Optional, Any

try:
    import redis as _redis
except Exception:
    _redis = None

from urllib.parse import urlparse
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("docstore")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    h.setFormatter(logging.Formatter(fmt))
    logger.addHandler(h)
logger.setLevel(os.environ.get("DOCSTORE_LOG_LEVEL", "INFO"))

# Configuration
REDIS_URL = os.environ.get("REDIS_URL", "").strip()
DOC_TTL_SECONDS = int(os.environ.get("DOC_TTL_SECONDS", "86400"))
COMPRESS_THRESHOLD = int(os.environ.get("COMPRESS_THRESHOLD", str(32 * 1024)))  # 32 KB default
_CHUNK_SIZE = int(os.environ.get("REDIS_CHUNK_SIZE", str(4 * 1024 * 1024)))  # 4 MB default
_MAX_SINGLE_KEY = int(os.environ.get("REDIS_MAX_SINGLE", str(100 * 1024 * 1024)))  # 100 MB

_MARKER_COMPRESSED = b"gzip:"  # prefix for compressed single-key payloads
_META_SUFFIX = ":meta"         # metadata key suffix for chunked storage
_BINARY_META_SUFFIX = ":binmeta"

# In-memory fallback (dev)
DOC_STORE: Dict[str, Tuple[float, Any]] = {}

print("REDIS_URL=", REDIS_URL)

REDIS = None
if REDIS_URL:
    try:
        parsed = urlparse(REDIS_URL)
        if parsed.scheme not in ("redis", "rediss"):
            raise ValueError(f"Unsupported Redis scheme: {parsed.scheme!r}")
        if _redis is None:
            raise RuntimeError("redis package not available (pip install redis)")
        REDIS = _redis.from_url(REDIS_URL, decode_responses=False, socket_keepalive=True)
        try:
            if not REDIS.ping():
                raise RuntimeError("Redis ping returned falsy response")
            logger.info("Connected to Redis at %s", REDIS_URL)
        except Exception as ex:
            logger.warning("Failed to ping Redis at %s: %s", REDIS_URL, ex)
            REDIS = None
    except Exception as e:
        logger.exception("Invalid REDIS_URL or failed to init Redis client: %s", e)
        REDIS = None
else:
    logger.info("No REDIS_URL provided; using in-memory fallback. Set REDIS_URL to connect to Redis.")

# Helpers
def _gzip_compress_bytes(data: bytes) -> bytes:
    return gzip.compress(data, compresslevel=6)

def _gzip_decompress_bytes(data: bytes) -> bytes:
    return gzip.decompress(data)

def _store_in_redis_raw(key: str, value: bytes, ttl: int) -> bool:
    if REDIS is None:
        return False
    try:
        REDIS.setex(key, ttl, value)
        return True
    except Exception as ex:
        logger.exception("Redis setex failed for key %s: %s", key, ex)
        return False


def _binary_prefix(doc_id: str, kind: str) -> str:
    return f"docbin:{kind}:{doc_id}"


def put_doc_binary(doc_id: str, blob: bytes, kind: str = "pdf") -> bool:
    """Store raw binary data such as original PDF bytes for queued workers."""
    if not doc_id:
        logger.error("put_doc_binary called with empty doc_id")
        return False

    if blob is None:
        logger.error("put_doc_binary called with empty blob for doc_id=%s kind=%s", doc_id, kind)
        return False

    if not isinstance(blob, (bytes, bytearray, memoryview)):
        raise TypeError("blob must be bytes-like")

    blob = bytes(blob)
    prefix = _binary_prefix(doc_id, kind)

    if REDIS is None:
        DOC_STORE[prefix] = (time.time(), blob)
        logger.warning("Redis not configured; stored binary %s in memory (size=%d)", prefix, len(blob))
        return True

    try:
        if len(blob) <= _MAX_SINGLE_KEY:
            ok = _store_in_redis_raw(prefix, blob, DOC_TTL_SECONDS)
            if ok:
                try:
                    REDIS.delete(f"{prefix}{_BINARY_META_SUFFIX}")
                except Exception:
                    pass
                return True
    except Exception as ex:
        logger.exception("Unexpected Redis binary single-key store failure for %s: %s", prefix, ex)

    try:
        n_chunks = math.ceil(len(blob) / _CHUNK_SIZE)
        meta = {"chunks": n_chunks, "stored_bytes": len(blob), "compressed": False}
        pipeline = REDIS.pipeline()
        for i in range(n_chunks):
            start = i * _CHUNK_SIZE
            pipeline.setex(f"{prefix}:chunk:{i}", DOC_TTL_SECONDS, blob[start:start + _CHUNK_SIZE])
        pipeline.setex(f"{prefix}{_BINARY_META_SUFFIX}", DOC_TTL_SECONDS, json.dumps(meta).encode("utf-8"))
        pipeline.execute()
        return True
    except Exception as ex:
        logger.exception("Failed to store binary %s chunked: %s", prefix, ex)
        DOC_STORE[prefix] = (time.time(), blob)
        logger.warning("Fell back to in-memory binary store for %s", prefix)
        return True


def get_doc_binary(doc_id: str, kind: str = "pdf") -> bytes:
    if not doc_id:
        return b""

    prefix = _binary_prefix(doc_id, kind)

    if REDIS is not None:
        try:
            raw = REDIS.get(prefix)
            if raw is not None:
                if isinstance(raw, memoryview):
                    raw = raw.tobytes()
                elif isinstance(raw, str):
                    raw = raw.encode("latin-1", errors="ignore")
                return bytes(raw)

            meta_key = f"{prefix}{_BINARY_META_SUFFIX}"
            meta_raw = REDIS.get(meta_key)
            n_chunks = 0
            if meta_raw:
                try:
                    meta_str = meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw)
                    meta = json.loads(meta_str)
                    n_chunks = int(meta.get("chunks", 0))
                except Exception:
                    n_chunks = 0
            else:
                while REDIS.exists(f"{prefix}:chunk:{n_chunks}"):
                    n_chunks += 1

            if n_chunks > 0:
                chunks = []
                for i in range(n_chunks):
                    raw_chunk = REDIS.get(f"{prefix}:chunk:{i}")
                    if raw_chunk is None:
                        return b""
                    if isinstance(raw_chunk, memoryview):
                        raw_chunk = raw_chunk.tobytes()
                    elif isinstance(raw_chunk, str):
                        raw_chunk = raw_chunk.encode("latin-1", errors="ignore")
                    chunks.append(bytes(raw_chunk))
                return b"".join(chunks)
        except Exception as ex:
            logger.exception("Error fetching binary %s from Redis: %s", prefix, ex)

    tup = DOC_STORE.get(prefix)
    if tup:
        ts, value = tup
        if time.time() - ts > DOC_TTL_SECONDS:
            DOC_STORE.pop(prefix, None)
            return b""
        if isinstance(value, str):
            return value.encode("latin-1", errors="ignore")
        return bytes(value)

    return b""


def clear_doc_binary(doc_id: Optional[str], kind: str = "pdf") -> bool:
    if not doc_id:
        return False

    prefix = _binary_prefix(doc_id, kind)
    success = True

    if REDIS is not None:
        try:
            REDIS.delete(prefix)
            meta_key = f"{prefix}{_BINARY_META_SUFFIX}"
            meta_raw = REDIS.get(meta_key)
            if meta_raw:
                try:
                    meta_str = meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw)
                    meta = json.loads(meta_str)
                    cnt = int(meta.get("chunks", 0))
                except Exception:
                    cnt = 0
                if cnt > 0:
                    keys = [f"{prefix}:chunk:{i}" for i in range(cnt)]
                    if keys:
                        REDIS.delete(*keys)
                REDIS.delete(meta_key)
        except Exception as ex:
            logger.exception("Failed to delete binary %s from Redis: %s", prefix, ex)
            success = False

    DOC_STORE.pop(prefix, None)
    return success

# Core API
def put_doc_text(doc_id: str, text: str) -> bool:
    """
    Store full document text. Returns True on success (or fallback to in-memory).
    """
    if not doc_id:
        logger.error("put_doc_text called with empty doc_id")
        return False

    if not isinstance(text, str):
        text = str(text)

    raw_bytes = text.encode("utf-8", errors="replace")
    orig_size = len(raw_bytes)
    to_store = raw_bytes
    compressed = False

    try:
        if COMPRESS_THRESHOLD and orig_size >= COMPRESS_THRESHOLD:
            gz = _gzip_compress_bytes(raw_bytes)
            to_store = gz
            compressed = True
    except Exception as ex:
        logger.exception("Compression failed for doc %s: %s", doc_id, ex)
        to_store = raw_bytes
        compressed = False

    if REDIS is None:
        DOC_STORE[doc_id] = (time.time(), text)
        logger.warning("Redis not configured; stored doc %s in memory (size=%d)", doc_id, orig_size)
        return True

    try:
        if len(to_store) <= _MAX_SINGLE_KEY:
            payload = (_MARKER_COMPRESSED + to_store) if compressed else to_store
            ok = _store_in_redis_raw(f"doc:{doc_id}", payload, DOC_TTL_SECONDS)
            if ok:
                try:
                    REDIS.delete(f"doc:{doc_id}{_META_SUFFIX}")
                except Exception:
                    pass
                logger.debug("Stored doc %s in Redis as single key (orig %d -> stored %d)", doc_id, orig_size, len(payload))
                return True
    except Exception as ex:
        logger.exception("Unexpected Redis single-key store failure for %s: %s", doc_id, ex)

    # chunked storage
    try:
        gz_bytes = to_store
        n_chunks = math.ceil(len(gz_bytes) / _CHUNK_SIZE)
        meta = {"chunks": n_chunks, "orig_bytes": orig_size, "stored_bytes": len(gz_bytes), "compressed": bool(compressed)}
        pipeline = REDIS.pipeline()
        for i in range(n_chunks):
            start = i * _CHUNK_SIZE
            chunk = gz_bytes[start:start + _CHUNK_SIZE]
            key = f"doc:{doc_id}:chunk:{i}"
            pipeline.setex(key, DOC_TTL_SECONDS, chunk)
        pipeline.setex(f"doc:{doc_id}{_META_SUFFIX}", DOC_TTL_SECONDS, json.dumps(meta).encode("utf-8"))
        pipeline.execute()
        logger.debug("Stored doc %s in Redis as %d chunks (orig %d stored %d)", doc_id, n_chunks, orig_size, len(gz_bytes))
        return True
    except Exception as ex:
        logger.exception("Failed to store doc %s chunked: %s", doc_id, ex)
        DOC_STORE[doc_id] = (time.time(), text)
        logger.warning("Fell back to in-memory store for doc %s.", doc_id)
        return True

def _decode_redis_value(raw_val: Any, doc_id: Optional[str] = None) -> str:
    if raw_val is None:
        return ""

    if isinstance(raw_val, memoryview):
        raw_val = raw_val.tobytes()

    if isinstance(raw_val, (bytes, bytearray)):
        raw_bytes = bytes(raw_val)
        try:
            if raw_bytes.startswith(_MARKER_COMPRESSED):
                gz = raw_bytes[len(_MARKER_COMPRESSED):]
                try:
                    decompressed = _gzip_decompress_bytes(gz)
                    return decompressed.decode("utf-8", errors="replace")
                except Exception:
                    logger.exception("Failed to decompress gzip payload from Redis for doc %s", doc_id or "<unknown>")
            return raw_bytes.decode("utf-8", errors="replace")
        except Exception:
            logger.exception("Error decoding Redis bytes for doc %s", doc_id or "<unknown>")
            return raw_bytes.decode("utf-8", errors="replace")
    elif isinstance(raw_val, str):
        return raw_val
    else:
        try:
            b = bytes(raw_val)
            return b.decode("utf-8", errors="replace")
        except Exception:
            logger.exception("Unsupported Redis value type %s for doc %s", type(raw_val), doc_id or "<unknown>")
            return ""

def get_doc_text(doc_id: str) -> str:
    if not doc_id:
        return ""

    if REDIS is not None:
        try:
            raw = REDIS.get(f"doc:{doc_id}")
            if raw:
                return _decode_redis_value(raw, doc_id=doc_id)

            meta_key = f"doc:{doc_id}{_META_SUFFIX}"
            meta_raw = REDIS.get(meta_key)
            n_chunks = 0
            meta = None
            if meta_raw:
                try:
                    meta_str = meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw)
                    meta = json.loads(meta_str)
                    n_chunks = int(meta.get("chunks", 0))
                except Exception:
                    meta = None
                    n_chunks = 0

            if meta and n_chunks > 0:
                chunks = []
                for i in range(n_chunks):
                    key = f"doc:{doc_id}:chunk:{i}"
                    c = REDIS.get(key)
                    if not c:
                        logger.error("Missing chunk %d for doc %s", i, doc_id)
                        return ""
                    if isinstance(c, memoryview):
                        c = c.tobytes()
                    elif isinstance(c, str):
                        c = c.encode("utf-8", errors="replace")
                    chunks.append(bytes(c) if isinstance(c, (bytes, bytearray, memoryview)) else bytes(c))
                gz_all = b"".join(chunks)
                if meta.get("compressed"):
                    try:
                        raw = _gzip_decompress_bytes(gz_all)
                        return raw.decode("utf-8", errors="replace")
                    except Exception:
                        logger.exception("Failed to decompress chunked gzip for doc %s", doc_id)
                        return gz_all.decode("utf-8", errors="replace")
                else:
                    return gz_all.decode("utf-8", errors="replace")

            # fallback probe if meta missing
            if REDIS.exists(f"doc:{doc_id}:chunk:0"):
                cnt = 0
                while REDIS.exists(f"doc:{doc_id}:chunk:{cnt}"):
                    cnt += 1
                chunks = []
                for i in range(cnt):
                    c = REDIS.get(f"doc:{doc_id}:chunk:{i}")
                    if isinstance(c, str):
                        c = c.encode("utf-8", errors="replace")
                    chunks.append(c if isinstance(c, (bytes, bytearray)) else bytes(c))
                gz_all = b"".join(chunks)
                try:
                    raw = _gzip_decompress_bytes(gz_all)
                    return raw.decode("utf-8", errors="replace")
                except Exception:
                    return gz_all.decode("utf-8", errors="replace")
        except Exception as ex:
            logger.exception("Error fetching doc %s from Redis: %s", doc_id, ex)

    # in-memory fallback
    tup = DOC_STORE.get(doc_id)
    if tup:
        ts, txt = tup
        if time.time() - ts > DOC_TTL_SECONDS:
            DOC_STORE.pop(doc_id, None)
        else:
            return txt

    # PostgreSQL permanent fallback (survives Redis TTL expiry)
    try:
        from app.ingest_db import get_document_content
        pg_text = get_document_content(doc_id)
        if pg_text:
            logger.info("Redis miss for doc %s — served from PostgreSQL, re-warming cache", doc_id)
            # Best-effort re-warm Redis so subsequent reads are fast
            try:
                put_doc_text(doc_id, pg_text)
            except Exception:
                logger.debug("Re-warm Redis failed for doc %s (non-fatal)", doc_id)
            return pg_text
    except Exception as pg_ex:
        logger.warning("PostgreSQL fallback failed for doc %s: %s", doc_id, pg_ex)

    return ""

def clear_doc(doc_id: Optional[str]) -> bool:
    if not doc_id:
        return False
    success = True
    if REDIS is not None:
        try:
            REDIS.delete(f"doc:{doc_id}")
            meta_key = f"doc:{doc_id}{_META_SUFFIX}"
            meta_raw = REDIS.get(meta_key)
            if meta_raw:
                try:
                    meta_str = meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw)
                    meta = json.loads(meta_str)
                    cnt = int(meta.get("chunks", 0))
                except Exception:
                    cnt = 0
                if cnt > 0:
                    keys = [f"doc:{doc_id}:chunk:{i}" for i in range(cnt)]
                    if keys:
                        REDIS.delete(*keys)
                REDIS.delete(meta_key)
            else:
                i = 0
                while True:
                    k = f"doc:{doc_id}:chunk:{i}"
                    if REDIS.delete(k) == 0:
                        break
                    i += 1
        except Exception as ex:
            logger.exception("Failed to delete key(s) for %s from Redis: %s", doc_id, ex)
            success = False
    if doc_id in DOC_STORE:
        try:
            DOC_STORE.pop(doc_id, None)
        except Exception:
            logger.exception("Failed to pop doc from in-memory store")
            success = False
    clear_doc_binary(doc_id, kind="pdf")
    return success

def redis_healthy() -> bool:
    if REDIS is None:
        logger.debug("redis_healthy: Redis client not configured.")
        return False
    try:
        return bool(REDIS.ping())
    except Exception as ex:
        logger.exception("redis_healthy: Redis ping failed: %s", ex)
        return False

# Legacy compatibility helpers
def _legacy_build_chunks_from_redis(doc_id: str, preview_chars: int = 256) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not doc_id:
        return out
    prefix = f"doc:{doc_id}"

    if REDIS is None:
        tup = DOC_STORE.get(doc_id)
        if tup:
            ts, txt = tup
            preview = txt[:preview_chars]
            out.append({
                "chunk_id": None,
                "chunk_index": 0,
                "redis_key": prefix,
                "stored_bytes": len(txt.encode("utf-8")),
                "text_preview": preview,
                "start_token": None,
                "end_token": None,
                "token_count": len(preview.split())
            })
        return out

    try:
        raw = REDIS.get(prefix)
        if raw:
            val = _decode_redis_value(raw, doc_id=doc_id)
            preview = val[:preview_chars]
            out.append({
                "chunk_id": None,
                "chunk_index": 0,
                "redis_key": prefix,
                "stored_bytes": len(val.encode("utf-8")),
                "text_preview": preview,
                "start_token": None,
                "end_token": None,
                "token_count": len(preview.split())
            })
            return out

        meta_key = prefix + _META_SUFFIX
        meta_raw = REDIS.get(meta_key)
        n_chunks = 0
        if meta_raw:
            try:
                meta_str = meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw)
                meta = json.loads(meta_str)
                n_chunks = int(meta.get("chunks", 0))
            except Exception:
                n_chunks = 0
        else:
            if not REDIS.exists(f"{prefix}:chunk:0"):
                return out
            n_chunks = 0
            while REDIS.exists(f"{prefix}:chunk:{n_chunks}"):
                n_chunks += 1

        for i in range(n_chunks):
            key = f"{prefix}:chunk:{i}"
            val = REDIS.get(key)
            stored_bytes = (len(val) if isinstance(val, (bytes, bytearray)) else (len(str(val).encode('utf-8')) if val is not None else 0))
            preview = None
            token_count: Optional[int] = None
            if val:
                try:
                    if isinstance(val, (bytes, bytearray)):
                        preview = val[:preview_chars].decode("utf-8", errors="replace")
                        token_count = len(preview.split()) if preview else None
                    else:
                        preview = str(val)[:preview_chars]
                        token_count = len(preview.split()) if preview else None
                except Exception:
                    preview = None
                    token_count = None

            out.append({
                "chunk_id": None,
                "chunk_index": i,
                "redis_key": key,
                "stored_bytes": stored_bytes,
                "text_preview": preview,
                "start_token": None,
                "end_token": None,
                "token_count": token_count
            })

        return out

    except Exception:
        logger.exception("build_chunks_from_redis failed for doc %s", doc_id)
        return []

# Delegating wrapper to semantic_chunker
def _try_import_semantic_chunker():
    try:
        from app import semantic_chunker as sc  # type: ignore
        return sc
    except Exception:
        import importlib
        sc = importlib.import_module("semantic_chunker")
        return sc

def build_chunks_from_redis(doc_id: str, preview_chars: int = 256) -> List[Dict[str, Any]]:
    logger.info("build_chunks_from_redis: delegating to semantic_chunker for doc_id=%s", doc_id)

    rc = REDIS
    try:
        sc = _try_import_semantic_chunker()
        chunks = sc.build_chunks_from_redis(
            doc_id=doc_id,
            redis_client=rc,
            pdf_path=None,
            nlp=None,
            window_size=3,
            buffer_size=1,
            dry_run=True
        )
        adapted: List[Dict[str, Any]] = []
        prefix = f"doc:{doc_id}"
        has_single_key = False
        has_meta = False
        try:
            if rc is not None:
                if rc.exists(prefix):
                    has_single_key = True
                elif rc.exists(prefix + _META_SUFFIX):
                    has_meta = True
        except Exception:
            logger.debug("Unable to probe redis keys for doc %s", doc_id)

        import uuid
        for idx, c in enumerate(chunks):
            redis_key = None
            if c.get("redis_key"):
                redis_key = c.get("redis_key")
            else:
                if has_single_key:
                    redis_key = prefix
                elif has_meta:
                    redis_key = f"{prefix}:chunk:{c.get('chunk_index', idx)}"
                else:
                    redis_key = prefix
            adapted.append({
                "chunk_id": c.get("chunk_id") or str(uuid.uuid4()),
                "chunk_index": c.get("chunk_index", idx),
                "redis_key": redis_key,
                "stored_bytes": c.get("stored_bytes", len(c.get("text", "").encode("utf-8")) if c.get("text") else 0),
                "text_preview": c.get("text_preview"),
                "start_token": None,
                "end_token": None,
                "token_count": c.get("token_count")
            })

        logger.info("semantic_chunker returned %d chunks for doc_id=%s", len(adapted), doc_id)
        return adapted

    except Exception as sem_e:
        logger.exception("semantic_chunker.build_chunks_from_redis failed for doc_id=%s: %s", doc_id, sem_e)
        try:
            return _legacy_build_chunks_from_redis(doc_id, preview_chars=preview_chars)
        except Exception as legacy_e:
            logger.exception("Legacy build_chunks_from_redis also failed for doc_id=%s: %s", doc_id, legacy_e)
            return []
