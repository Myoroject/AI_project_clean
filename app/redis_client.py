# redis_client.py  -- Redis-only version (no S3)
# Updated to produce chunk metadata that matches your SQL schema / ingest_db expectations.
# Works on Linux and Windows (no OS-specific calls).
import os
import logging
import gzip
import json
import time
import math
import inspect
from typing import Optional, Tuple, List, Dict, Any
from urllib.parse import urlparse

# Optional: redis package
try:
    import redis as _redis  # type: ignore
except Exception:
    _redis = None

# dotenv (load .env) - works on Windows too when python-dotenv is installed
from dotenv import load_dotenv
load_dotenv()

# Configure module logger
logger = logging.getLogger("docstore")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    h.setFormatter(logging.Formatter(fmt))
    logger.addHandler(h)
logger.setLevel(os.environ.get("DOCSTORE_LOG_LEVEL", "INFO"))

# -------------------------
# Config (Redis-only)
# -------------------------
REDIS_URL = os.environ.get("REDIS_URL", "").strip()
DOC_TTL_SECONDS = int(os.environ.get("DOC_TTL_SECONDS", "86400"))
COMPRESS_THRESHOLD = int(os.environ.get("COMPRESS_THRESHOLD", "32768"))  # bytes
_CHUNK_SIZE = int(os.environ.get("REDIS_CHUNK_SIZE", str(4 * 1024 * 1024)))  # 4 MB default
_MAX_SINGLE_KEY = int(os.environ.get("REDIS_MAX_SINGLE", str(100 * 1024 * 1024)))  # 100 MB

# Markers
_MARKER_COMPRESSED = b"gzip:"  # bytes prefix for compressed single-value storage
_META_SUFFIX = ":meta"         # metadata key suffix for chunked storage

# In-memory fallback (development only)
DOC_STORE: dict[str, Tuple[float, str]] = {}

# Debug print
print("REDIS_URL=", REDIS_URL)

# Initialize Redis client if possible
REDIS = None
if REDIS_URL:
    try:
        parsed = urlparse(REDIS_URL)
        if parsed.scheme not in ("redis", "rediss"):
            raise ValueError(f"Unsupported Redis URL scheme: {parsed.scheme!r}")
        if _redis is None:
            raise RuntimeError("redis package not available (pip install redis)")
        REDIS = _redis.from_url(REDIS_URL, decode_responses=False, socket_keepalive=True)
        try:
            ok = REDIS.ping()
            if not ok:
                raise RuntimeError("Redis ping returned falsy response")
            logger.info("Connected to Redis at %s", REDIS_URL)
        except Exception as ex:
            logger.warning("Failed to ping Redis at %s: %s", REDIS_URL, ex)
            REDIS = None
    except Exception as e:
        logger.exception("Invalid REDIS_URL or failed to initialize Redis client: %s", e)
        REDIS = None
else:
    logger.info("No REDIS_URL provided; using in-memory fallback. Set REDIS_URL to connect to real Redis.")

# -------------------------
# Helpers: compress / decompress
# -------------------------
def _gzip_compress_bytes(data: bytes) -> bytes:
    return gzip.compress(data, compresslevel=6)

def _gzip_decompress_bytes(data: bytes) -> bytes:
    return gzip.decompress(data)

# -------------------------
# Low-level redis storage helper
# -------------------------
def _store_in_redis_raw(key: str, value: bytes, ttl: int) -> bool:
    assert isinstance(value, (bytes, bytearray))
    if REDIS is None:
        logger.debug("Redis not configured; cannot store key %s", key)
        return False
    try:
        REDIS.setex(key, ttl, value)
        return True
    except Exception as ex:
        logger.exception("Redis setex failed for key %s: %s", key, ex)
        return False

# -------------------------
# Put / get / chunking logic
# -------------------------
def put_doc_text(doc_id: str, text: str) -> bool:
    """
    Store extracted text into Redis only.
    Strategy:
      - UTF-8 encode
      - gzip compress if above COMPRESS_THRESHOLD
      - if stored bytes <= _MAX_SINGLE_KEY -> store single key `doc:{doc_id}` (prefix with 'gzip:' if compressed)
      - else chunk into doc:{doc_id}:chunk:0 .. chunk:N-1 and store meta at doc:{doc_id}:meta
    """
    if not doc_id:
        logger.error("put_doc_text called with empty doc_id")
        return False

    raw_bytes = text.encode("utf-8")
    size = len(raw_bytes)

    # maybe compress
    to_store = raw_bytes
    compressed = False
    try:
        if COMPRESS_THRESHOLD and size >= COMPRESS_THRESHOLD:
            gz = _gzip_compress_bytes(raw_bytes)
            to_store = gz
            compressed = True
    except Exception as ex:
        logger.exception("Compression failed for doc %s: %s", doc_id, ex)
        # fallback: store raw bytes

    # fallback in-memory
    if REDIS is None:
        DOC_STORE[doc_id] = (time.time(), text)
        logger.warning("Redis not configured; stored doc %s in memory uncompressed (dev).", doc_id)
        return True

    # store single-key if small enough
    if len(to_store) <= _MAX_SINGLE_KEY:
        try:
            payload = _MARKER_COMPRESSED + to_store if compressed else to_store
            ok = _store_in_redis_raw(f"doc:{doc_id}", payload, DOC_TTL_SECONDS)
            if ok:
                # remove old meta/chunks if any (best-effort)
                try:
                    REDIS.delete(f"doc:{doc_id}{_META_SUFFIX}")
                except Exception:
                    pass
                logger.debug("Stored doc %s in Redis as single key (orig %d, stored %d).", doc_id, size, len(payload))
                return True
            else:
                logger.error("Failed to store doc %s in Redis single-key.", doc_id)
        except Exception as ex:
            logger.exception("Unexpected Redis failure storing single-key for doc %s: %s", doc_id, ex)
            # fall through to chunking

    # chunked storage
    try:
        gz_bytes = to_store
        n_chunks = math.ceil(len(gz_bytes) / _CHUNK_SIZE)
        meta = {"chunks": n_chunks, "orig_bytes": size, "stored_bytes": len(gz_bytes), "compressed": bool(compressed)}
        pipeline = REDIS.pipeline()
        for i in range(n_chunks):
            start = i * _CHUNK_SIZE
            chunk = gz_bytes[start:start + _CHUNK_SIZE]
            key = f"doc:{doc_id}:chunk:{i}"
            pipeline.setex(key, DOC_TTL_SECONDS, chunk)
        pipeline.setex(f"doc:{doc_id}{_META_SUFFIX}", DOC_TTL_SECONDS, json.dumps(meta).encode("utf-8"))
        pipeline.execute()
        logger.debug("Stored doc %s in Redis as %d chunks (orig %d, stored %d).", doc_id, n_chunks, size, len(gz_bytes))
        return True
    except Exception as ex:
        logger.exception("Failed to store doc %s chunked: %s", doc_id, ex)
        DOC_STORE[doc_id] = (time.time(), text)
        logger.warning("Fell back to in-memory store for doc %s.", doc_id)
        return True

def _decode_redis_value(raw_val: Optional[bytes], doc_id: Optional[str] = None) -> str:
    """
    Convert a Redis-returned value to original text.
    Handles:
      - single-key compressed (prefix b"gzip:")
      - single-key raw bytes
      - if raw_val is None and doc_id provided -> attempt chunked assemble using meta
    """
    if raw_val is None:
        # try chunked retrieval if doc_id supplied
        if not doc_id or REDIS is None:
            return ""
        try:
            meta_raw = REDIS.get(f"doc:{doc_id}{_META_SUFFIX}")
            if not meta_raw:
                return ""
            # decode meta (meta_raw may be bytes or str)
            if isinstance(meta_raw, (bytes, bytearray)):
                meta = json.loads(meta_raw.decode("utf-8"))
            else:
                meta = json.loads(str(meta_raw))
            chunks = []
            for i in range(int(meta.get("chunks", 0))):
                c = REDIS.get(f"doc:{doc_id}:chunk:{i}")
                if c is None:
                    logger.error("Missing chunk %d for doc %s", i, doc_id)
                    return ""
                chunks.append(c if isinstance(c, (bytes, bytearray)) else str(c).encode("utf-8"))
            gz_all = b"".join(chunks)
            if meta.get("compressed"):
                raw = _gzip_decompress_bytes(gz_all)
                return raw.decode("utf-8")
            else:
                return gz_all.decode("utf-8")
        except Exception as ex:
            logger.exception("Error decoding chunked doc %s: %s", doc_id, ex)
            return ""

    # normalize to bytes
    if isinstance(raw_val, memoryview):
        raw_bytes = raw_val.tobytes()
    elif isinstance(raw_val, (bytes, bytearray)):
        raw_bytes = raw_val
    elif isinstance(raw_val, str):
        raw_bytes = raw_val.encode("utf-8")
    else:
        try:
            raw_bytes = bytes(raw_val)
        except Exception:
            logger.exception("Unsupported type from Redis: %s", type(raw_val))
            return ""

    try:
        if raw_bytes.startswith(_MARKER_COMPRESSED):
            gz = raw_bytes[len(_MARKER_COMPRESSED):]
            try:
                decompressed = _gzip_decompress_bytes(gz)
                return decompressed.decode("utf-8")
            except Exception:
                logger.exception("Failed to decompress gzip payload from Redis for doc %s.", doc_id or "<unknown>")
                # fall through to try decode raw bytes
        # default: interpret as UTF-8 text
        try:
            return raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            logger.exception("Failed to decode Redis bytes as UTF-8 for doc %s.", doc_id or "<unknown>")
            return ""
    except Exception:
        logger.exception("Unexpected error decoding Redis value.")
        return ""

def get_doc_text(doc_id: str) -> str:
    """Fetch entire document text from Redis (or in-memory fallback)."""
    if not doc_id:
        return ""
    if REDIS is not None:
        try:
            raw = REDIS.get(f"doc:{doc_id}")
            result = _decode_redis_value(raw, doc_id=doc_id)
            if result:
                return result
        except Exception as ex:
            logger.exception("Error fetching doc %s from Redis: %s", doc_id, ex)
    # fallback
    tup = DOC_STORE.get(doc_id)
    if tup:
        ts, txt = tup
        if time.time() - ts > DOC_TTL_SECONDS:
            DOC_STORE.pop(doc_id, None)
            return ""
        return txt
    return ""

def clear_doc(doc_id: Optional[str]) -> bool:
    """Remove a document’s text from store (Redis + in-memory fallback)."""
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
                    meta = json.loads(meta_raw.decode("utf-8"))
                    cnt = int(meta.get("chunks", 0))
                    keys = [f"doc:{doc_id}:chunk:{i}" for i in range(cnt)]
                    if keys:
                        REDIS.delete(*keys)
                except Exception:
                    i = 0
                    while True:
                        k = f"doc:{doc_id}:chunk:{i}"
                        if REDIS.delete(k) == 0:
                            break
                        i += 1
                REDIS.delete(meta_key)
        except Exception as ex:
            logger.exception("Failed to delete key(s) for %s from Redis: %s", doc_id, ex)
            success = False
    if doc_id in DOC_STORE:
        try:
            DOC_STORE.pop(doc_id, None)
        except Exception:
            logger.exception("Failed to pop doc from in-memory store")
            success = False
    return success

def redis_healthy() -> bool:
    """Check if Redis is alive."""
    if REDIS is None:
        logger.debug("redis_healthy: Redis client not configured.")
        return False
    try:
        return bool(REDIS.ping())
    except Exception as ex:
        logger.exception("redis_healthy: Redis ping failed: %s", ex)
        return False

# -------------------------
# NEW: Build chunk metadata suitable for DB insert
# -------------------------
def build_chunks_from_redis(doc_id: str, preview_chars: int = 256) -> List[Dict[str, Any]]:
    """
    Inspect Redis keys for this doc_id and return a list of chunk metadata dicts.

    Returned dict keys (matches ingest_db.insert_chunks_bulk expectation):
      - chunk_id -> None (DB will generate if omitted) or string
      - chunk_index -> int
      - redis_key -> str (e.g., "doc:<doc_id>" or "doc:<doc_id>:chunk:0")
      - stored_bytes -> int
      - text_preview -> Optional[str]
      - start_token -> None (use later if tokenizing)
      - end_token -> None
      - token_count -> Optional[int] (whitespace-tokenized from preview if available)
    """
    out: List[Dict[str, Any]] = []
    if not doc_id:
        return out
    prefix = f"doc:{doc_id}"

    if REDIS is None:
        # If Redis not configured we can't build chunk metadata; caller may fallback to DOC_STORE
        return out

    try:
        # 1) Single-key stored doc (fast path)
        raw = REDIS.get(prefix)
        if raw is not None:
            stored_bytes = (len(raw) if isinstance(raw, (bytes, bytearray)) else len(str(raw).encode("utf-8")))
            preview = None
            token_count: Optional[int] = None
            try:
                if isinstance(raw, (bytes, bytearray)) and raw.startswith(_MARKER_COMPRESSED):
                    # Try a lightweight preview: take first N bytes after marker and attempt decompression of that slice.
                    # If decompression fails (likely because slice is partial), skip preview to avoid heavy CPU cost.
                    gz = raw[len(_MARKER_COMPRESSED):]
                    try:
                        dec = _gzip_decompress_bytes(gz)
                        preview = dec[:preview_chars].decode("utf-8", errors="replace")
                        token_count = len(preview.split())
                    except Exception:
                        # skip preview (avoid full decompression on giant blobs)
                        preview = None
                        token_count = None
                else:
                    # treat as UTF-8 bytes or str
                    preview = (raw[:preview_chars].decode("utf-8", errors="replace")
                               if isinstance(raw, (bytes, bytearray)) else str(raw)[:preview_chars])
                    token_count = len(preview.split()) if preview else None
            except Exception:
                preview = None
                token_count = None

            out.append({
                "chunk_id": None,
                "chunk_index": 0,
                "redis_key": prefix,
                "stored_bytes": stored_bytes,
                "text_preview": preview,
                "start_token": None,
                "end_token": None,
                "token_count": token_count
            })
            return out

        # 2) Chunked storage (meta key)
        meta_key = prefix + _META_SUFFIX
        meta_raw = REDIS.get(meta_key)
        if meta_raw:
            try:
                meta = json.loads(meta_raw.decode("utf-8") if isinstance(meta_raw, (bytes, bytearray)) else str(meta_raw))
                n_chunks = int(meta.get("chunks", 0))
            except Exception:
                n_chunks = 0
        else:
            # fallback: detect chunk existence sequentially
            if not REDIS.exists(f"{prefix}:chunk:0"):
                return out
            n_chunks = 0
            while REDIS.exists(f"{prefix}:chunk:{n_chunks}"):
                n_chunks += 1

        # build chunk entries
        for i in range(n_chunks):
            key = f"{prefix}:chunk:{i}"
            val = REDIS.get(key)
            stored_bytes = (len(val) if isinstance(val, (bytes, bytearray)) else (len(str(val).encode("utf-8")) if val is not None else 0))
            preview = None
            token_count: Optional[int] = None
            if val:
                try:
                    # attempt safe preview decode - chunks may be compressed stream bytes (not decompressible per-chunk)
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
