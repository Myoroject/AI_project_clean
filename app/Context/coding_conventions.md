# DocuMind — Coding Conventions

> Adapted from Microsoft .NET team coding conventions, tailored for Python (Flask backend) and TypeScript (Next.js frontend).

## Design Goals

Our coding conventions serve four goals:

1. **Correctness** — Code must be resilient and correct. Every function should handle edge cases, validate inputs, and fail gracefully.
2. **Teaching** — Code should be self-documenting. A new developer reading the code should understand *what* and *why* without external docs.
3. **Consistency** — All modules should follow the same patterns. Reading `retrieval.py` should feel identical to reading `upload_flow.py`.
4. **Adoption** — We use modern Python (3.10+) features. Type hints, dataclasses, f-strings, and pattern matching are encouraged.

---

## Python Conventions

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files / modules | `snake_case` | `block_extractor.py`, `embedding_service.py` |
| Functions | `snake_case` | `embed_query()`, `get_doc_text()` |
| Classes | `PascalCase` | `DocumentBlock`, `EvidenceBlock` |
| Constants | `UPPER_SNAKE_CASE` | `VECTOR_DIM`, `PREVIEW_LIMIT` |
| Private / internal | Leading underscore | `_model`, `_gzip_compress_bytes()` |
| Type aliases | `PascalCase` | N/A — use inline type hints |

### Type Hints — Required

```python
# Good: Fully typed signatures
def search(doc_id: str, query: str, top_k: int = 10) -> List[EvidenceBlock]:

# Good: Optional and Union types
def handle_text_upload(user_id: Optional[str], filename: str, full_text: str, pdf_bytes: Optional[bytes] = None) -> str:

# Bad: No type hints
def search(doc_id, query, top_k=10):
```

### Docstrings — Required for All Functions

Every function must have a docstring explaining:
1. What it does (one sentence).
2. Parameters and return value (if not obvious from type hints).
3. Side effects (database writes, background threads, etc.).

```python
def extract_blocks_with_geometry(pdf_bytes: bytes, doc_id: str) -> List[DocumentBlock]:
    """
    Extract text blocks from PDF with full bounding box geometry.
    
    Reads each page using PyMuPDF, sorts blocks by reading order (top-to-bottom,
    left-to-right), classifies block type deterministically, and returns
    DocumentBlock instances with computed center, width, and height.
    """
```

### Code Comments — Inline Summary

For every function or significant code block, write a summary comment explaining *what it does and why*:

```python
# 4. Deterministic Geometry Reranking
# We apply scoring bonuses based on block type (tables are more valuable),
# page position (body content over margins), and block area (larger = more substance).
evidence = []
for b in raw_blocks:
    cosine_sim = score_map.get(b.block_id, 0.0)
    final_score = cosine_sim * 0.60  # Base semantic score (60% weight)
```

### Imports — Organize by Category

```python
# Standard library
import os
import io
import logging
from typing import List, Optional, Tuple

# Third-party
import numpy as np
from flask import Blueprint, jsonify, request
import psycopg2

# Local / project
from app.redis_client import put_doc_text, get_doc_text
from embedding_service import embed_query
```

### Error Handling

1. **Catch specific exceptions** — never bare `except:`.
2. **Log before re-raising** — use `logger.exception()` for full traceback.
3. **Fail gracefully** — always provide a fallback or user-facing error message.

```python
# Good: Specific exception with context
try:
    text = extract_pdf_text(data)
except Exception as e:
    current_app.logger.exception("extract_pdf_text failed for %s: %s", filename, e)
    return jsonify({"ok": False, "error": "Upload failed", "detail": str(e)}), 500

# Bad: Bare except that swallows errors
try:
    text = extract_pdf_text(data)
except:
    pass
```

### Logging

- Use `logging.getLogger("module_name")` per module.
- Log levels: `DEBUG` for tracing, `INFO` for operations, `WARNING` for non-fatal issues, `ERROR`/`EXCEPTION` for failures.
- Use `%s` formatting (not f-strings) in logger calls for lazy evaluation.

```python
logger = logging.getLogger("upload_flow")
logger.info("[upload_flow] put_doc_text doc_id=%s success=%s bytes=%d", doc_id, bool(ok), len(text))
```

### Data Classes for Structured Data

```python
@dataclass
class DocumentBlock:
    """A text block with full geometry information."""
    block_id: str
    doc_id: str
    page_number: int
    text: str
    x1: float  # left edge
    y1: float  # top edge
    x2: float  # right edge
    y2: float  # bottom edge
```

### Thread Safety

- Use `threading.Lock` for shared mutable state (FAISS index, model singletons).
- Use the double-checked locking pattern for lazy initialization.

```python
_model = None
_model_lock = threading.Lock()

def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:  # Double-check inside lock
                _model = SentenceTransformer(MODEL_NAME)
    return _model
```

---

## TypeScript / React Conventions

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Components | `PascalCase` | `AuthPortal.tsx`, `DashboardShell.tsx` |
| Functions / hooks | `camelCase` | `handleSubmit()`, `useAuth()` |
| Constants | `UPPER_SNAKE_CASE` | `API_BASE_URL` |
| CSS classes | `camelCase` or `kebab-case` | `.uploadCard`, `.chat-window` |

### File Structure

- One component per file.
- File name matches the component name.
- Shared components in `components/`, page-specific in `app/`.

### Props & State

- Define explicit TypeScript interfaces for component props.
- Use React hooks (`useState`, `useEffect`) for state management.

---

## Database Conventions

### Table Names
- `snake_case`, plural: `documents`, `chunks`, `document_blocks`, `auth_users`.

### Column Names
- `snake_case`: `doc_id`, `block_type`, `created_at`, `password_hash`.

### Timestamps
- Always store as `TIMESTAMPTZ` (with timezone).
- Default to `NOW()` in PostgreSQL.
- Use ISO 8601 format in application code.

### IDs
- Document IDs: UUID4 hex string (`uuid.uuid4().hex` or `str(uuid.uuid4())`).
- Block IDs: UUID4 hex string.
- Chunk IDs: UUID4 hex string.

---

## API Conventions

### Response Format

All JSON API responses follow this structure:

```json
{
  "ok": true,
  "data": { ... }
}
```

or on error:

```json
{
  "ok": false,
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Successful response |
| 400 | Bad request (validation failure) |
| 401 | Authentication required |
| 404 | Resource not found |
| 500 | Internal server error |

### Authentication Guards

Every authenticated endpoint must call `require_authenticated_api()` and return early on failure:

```python
user_email, auth_error = require_authenticated_api()
if auth_error:
    return auth_error
```

---

## Git Conventions

### Commit Messages
- Use present tense: "Add upload progress bar" not "Added upload progress bar".
- Start with a verb: "Fix", "Add", "Remove", "Refactor", "Update".
- Keep the subject line under 72 characters.

### Branch Naming
- `feature/upload-progress-bar`
- `fix/redis-connection-timeout`
- `refactor/auth-service`
