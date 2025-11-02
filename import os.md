import os

REDIS = None
try:
    import redis as _redis
    _redis_url = os.environ.get("REDIS_URL")
    if _redis_url:
        REDIS = _redis.from_url(_redis_url, decode_responses=True)
except Exception:
    REDIS = None  # gracefully degrade

# In-memory fallback (development only)
DOC_STORE: dict[str, str] = {}
DOC_TTL_SECONDS = int(os.environ.get("DOC_TTL_SECONDS", "86400"))  # default 1 day


def put_doc_text(doc_id: str, text: str):
    """Store extracted text in Redis or fallback dict."""
    if REDIS is not None:
        REDIS.setex(f"doc:{doc_id}", DOC_TTL_SECONDS, text)
    else:
        DOC_STORE[doc_id] = text


def get_doc_text(doc_id: str) -> str:
    """Fetch extracted text from Redis or fallback dict."""
    if not doc_id:
        return ""
    if REDIS is not None:
        val = REDIS.get(f"doc:{doc_id}")
        return val or ""
    return DOC_STORE.get(doc_id, "")


def clear_doc(doc_id: str | None):
    """Remove a document’s text from store."""
    if not doc_id:
        return
    if REDIS is not None:
        try:
            REDIS.delete(f"doc:{doc_id}")
        except Exception:
            pass
    else:
        DOC_STORE.pop(doc_id, None)


def redis_healthy() -> bool:
    """Check if Redis is alive."""
    if REDIS is None:
        return False
    try:
        return bool(REDIS.ping())
    except Exception:
        return False
