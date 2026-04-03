# DocuMind — Architecture

## System Overview

DocuMind follows a **dual-server architecture**: a **Flask API backend** (port 5000) serving the REST API and a **Next.js frontend** (port 3000) serving the React-based UI. The two communicate via CORS-enabled HTTP, with Flask providing all data endpoints and Next.js handling all user-facing rendering.

```
┌─────────────────────────────────────────────────────────┐
│                   USER (Browser)                        │
│                  http://localhost:3000                   │
└──────────────┬──────────────────────────┬───────────────┘
               │ UI Rendering             │ API Calls
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│   Next.js Frontend   │   │      Flask API Backend       │
│    (Port 3000)       │   │       (Port 5000)            │
│                      │   │                              │
│  • AuthPortal.tsx    │   │  • /api/auth/*  (Auth)       │
│  • DocumindLanding   │   │  • /upload      (Ingest)     │
│  • DashboardShell    │   │  • /ask         (Search)     │
│  • WorkspaceShell    │   │  • /api/document (Retrieve)  │
│  • Analysis page     │   │  • /chat        (Chat UI)    │
└──────────────────────┘   └──────┬───────────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
        ┌────────────┐   ┌──────────────┐   ┌──────────────┐
        │   Redis    │   │  PostgreSQL  │   │ FAISS Index  │
        │  (Cache)   │   │  (Persist)   │   │ (Vectors)    │
        │            │   │              │   │              │
        │ doc:{id}   │   │ documents    │   │ HNSW Flat    │
        │ doc:{id}:  │   │ chunks       │   │ 384-dim      │
        │  chunk:N   │   │ doc_blocks   │   │ L2 metric    │
        │ doc:{id}:  │   │ auth_users   │   │              │
        │  meta      │   │ auth_resets  │   │ vector_store │
        └────────────┘   │ embeddings   │   │  .faiss      │
                         │  _map        │   │ vector_meta  │
                         └──────────────┘   │  .pkl        │
                                            └──────────────┘
```

---

## Backend Architecture (Flask)

### App Factory — `app/__init__.py`

```python
def create_app() -> Flask:
```

- Creates Flask instance with `SECRET_KEY` from env vars.
- Sets `MAX_CONTENT_LENGTH` = 20 MB.
- Hardens session cookies (`HttpOnly`, `SameSite=Lax`, `Secure` in production).
- Configures **CORS** for Next.js origins (ports 3000, 3001).
- Suppresses `pdfminer` debug logs.
- Optionally enables **Werkzeug ProfilerMiddleware** when `FLASK_PROFILE=1`.
- Registers the `routes` Blueprint.

### Routes Blueprint — `app/routes.py`

| Route | Method | Function | Purpose |
|-------|--------|----------|---------|
| `/` | GET | `index()` | Redirects to Next.js at `localhost:3000` |
| `/api/auth/config` | GET | `auth_config()` | Returns Google OAuth status + password rules |
| `/api/auth/me` | GET | `auth_me()` | Returns current authenticated user info |
| `/api/auth/register` | POST | `auth_register()` | Email + password registration |
| `/api/auth/login` | POST | `auth_login()` | Email + password login |
| `/api/auth/logout` | POST | `auth_logout()` | Clears session |
| `/api/auth/forgot-password/request` | POST | `auth_forgot_password_request()` | Sends OTP email |
| `/api/auth/forgot-password/verify` | POST | `auth_forgot_password_verify()` | Validates OTP, returns reset token |
| `/api/auth/forgot-password/reset` | POST | `auth_forgot_password_reset()` | Sets new password with reset token |
| `/api/auth/google/start` | GET | `auth_google_start()` | Initiates Google OAuth flow |
| `/api/auth/google/callback` | GET | `auth_google_callback()` | Google OAuth callback handler |
| `/upload` | POST | `upload()` | Accepts JSON, form, or multipart file uploads |
| `/search/<doc_id>` | GET | `search_page()` | Renders Jinja2 search template |
| `/ask` | POST | `ask()` | Processes user question via retrieval pipeline |
| `/reset` | GET | `reset()` | Clears session + Redis document |
| `/healthz` | GET | `healthz()` | Returns app + Redis health status |
| `/api/document/<doc_id>` | GET | `get_document()` | Returns document data as JSON for Next.js |
| `/chat/<doc_id>` | GET | `chat()` | Renders Jinja2 chat template |

### Upload Flow — `app/upload_flow.py`

```python
def handle_text_upload(user_id, filename, full_text, pdf_bytes=None) -> str:
```

**Fast path (<3s target):**

1. **Generate** `doc_id` (UUID4).
2. **Store** full text in Redis (with gzip compression for payloads > 32KB).
3. **Insert** document metadata row in PostgreSQL (`documents` table).
4. **Extract** geometry blocks from PDF (if `pdf_bytes` provided) — stores in `document_blocks` table.
5. **Spawn** background thread to embed all blocks via BGE + store in FAISS index.

### Redis Client — `app/redis_client.py`

| Function | Purpose |
|----------|---------|
| `put_doc_text(doc_id, text)` | Store document text (single-key or chunked, gzip compressed) |
| `get_doc_text(doc_id)` | Reassemble and return unicode text (handles gzip, chunked, fallback) |
| `clear_doc(doc_id)` | Remove all Redis keys for a document |
| `redis_healthy()` | Ping Redis to check connectivity |
| `build_chunks_from_redis(doc_id)` | Delegates to semantic_chunker, falls back to legacy chunk reader |

**Storage strategy:**
- Small docs (< 100MB): Single key `doc:{id}` with optional `gzip:` prefix.
- Large docs: Chunked across `doc:{id}:chunk:0`, `doc:{id}:chunk:1`, etc. with metadata at `doc:{id}:meta`.
- Fallback: In-memory `DOC_STORE` dict when Redis is unavailable.

### Authentication Service — `app/auth_service.py`

| Function | Purpose |
|----------|---------|
| `register_user(email, password)` | Creates account with bcrypt hash, validates password rules |
| `authenticate_user(email, password)` | Validates credentials, updates `last_login_at` |
| `authenticate_google_oauth(code)` | Exchanges Google auth code for user profile, upserts user |
| `create_password_reset(email)` | Generates 6-digit OTP, sends via SMTP (or logs in dev mode) |
| `verify_password_reset_otp(email, otp)` | Validates OTP, returns reset token |
| `reset_password(email, token, password)` | Sets new password with verified reset token |

**Password rules:** 12+ chars, uppercase, lowercase, digit, special character.
**Auth providers:** `password`, `google`, `hybrid` (both linked).

### Storage Helpers — `app/storage.py`

| Function | Purpose |
|----------|---------|
| `extract_pdf_text(bytes)` | PyMuPDF (fitz) extraction — faster than PDFMiner |
| `extract_docx_text(bytes)` | python-docx paragraph extraction |
| `ocr_image_to_text(bytes)` | Tesseract OCR via pytesseract |
| `read_text_file(file)` | UTF-8/Latin-1 text file reader |
| `naive_search_answer(haystack, query)` | Fallback keyword matching when retrieval pipeline is unavailable |
| `human_size(num_bytes)` | Human-readable byte size formatter |

### Database Layer — `app/db.py`

- Loads `.env` from project root using `python-dotenv`.
- Supports `DATABASE_URL` directly or constructs from `PG_*` env vars.
- Returns `psycopg2` connections.

### Ingestion DB — `app/ingest_db.py`

| Function | Purpose |
|----------|---------|
| `insert_document(doc_id, …)` | Upserts document metadata row (computes page count from PDF) |
| `update_document_status(doc_id, status)` | Updates document status (uploaded → ready → error) |
| `insert_chunks_bulk(doc_id, chunks)` | Bulk inserts chunk metadata into `chunks` table |
| `insert_embeddings_map_bulk(entries)` | Bulk inserts into `embeddings_map` table |

---

## Core AI Pipeline

### Block Extractor — `block_extractor.py`

```python
def process_document(doc_id, pdf_bytes=None, pdf_path=None) -> List[DocumentBlock]:
```

- Extracts text blocks from PDF using PyMuPDF `page.get_text("blocks")`.
- Each block carries full bounding box geometry: `(x1, y1, x2, y2)` + derived center `(cx, cy)`, `width`, `height`.
- Classifies blocks deterministically: `empty`, `footer`, `header`, `numeric_value`, `table_cell`, `table`, `line`, `paragraph`.
- Stores all blocks in PostgreSQL `document_blocks` table with indexes on `(doc_id, page_number)`, `block_type`, and `parent_block_id`.

### Embedding Service — `embedding_service.py`

```python
def embed_texts(texts: List[str]) -> np.ndarray:   # For document blocks
def embed_query(query: str) -> np.ndarray:          # For user queries
```

- Uses **BAAI/bge-small-en-v1.5** (384-dim, retrieval-optimized).
- Lazy-loads model with thread-safe singleton pattern.
- Document texts: embedded without prefix.
- User queries: prefixed with `"Represent this sentence for searching relevant passages: "` (BGE requirement).
- Outputs L2-normalized float32 arrays (cosine-ready).

### FAISS Index — `app/faiss_index.py`

```python
def add_blocks(block_ids: List[str], embeddings: np.ndarray):
def search(query_embedding: np.ndarray, top_k: int = 10) -> List[Tuple[str, float]]:
```

- **IndexHNSWFlat** with 32 connections per node.
- L2 distance (equivalent to cosine for normalized vectors: `cosine_sim = 1 - L2²/2`).
- Integer ID mapping: FAISS internal IDs → `block_id` strings via pickle metadata file.
- Thread-safe with `threading.Lock`.
- Persisted to disk: `data/vector_store.faiss` + `data/vector_metadata.pkl`.

### Semantic Chunker — `semantic_chunker.py`

```python
def build_chunks_from_redis(doc_id, ...) -> List[dict]:
```

- Multi-source text acquisition: Redis → provided client → PDF bytes → PDF path → env fallback.
- Cleans text for spaCy (handles UTF-16 surrogates, NFC normalization).
- Detects blocks from text (paragraph boundary detection).
- Tags block types: `figure_caption`, `equation`, `table`, `numeric_table`, `text`.
- Builds sentence spans using spaCy.
- Creates overlapping windows for context preservation.
- Persists chunks to PostgreSQL `chunks` table.

### Retrieval Engine — `retrieval.py`

```python
def search(doc_id: str, query: str, top_k: int = 10) -> List[EvidenceBlock]:
```

**Pipeline:**
1. Embed query via `embed_query()`.
2. ANN search via FAISS (`top_k * 3` candidates for broad recall).
3. Fetch full blocks from PostgreSQL by `block_id`.
4. **Deterministic geometry-based reranking:**
   - 60% weight: cosine similarity score.
   - Block type bonus: `table` (+0.15), `paragraph` (+0.10), `header` (+0.05).
   - Page position bonus: body content (y1 50–750) gets +0.05.
   - Block area bonus: large blocks (>10K px²) get +0.10, medium (>1K) get +0.05.
5. Sort by final score, return top K.

---

## Frontend Architecture (Next.js)

### Component Hierarchy

```
frontend/
├── app/
│   ├── page.tsx              → Redirects to DocumindLanding
│   ├── layout.tsx            → Root layout with metadata
│   ├── globals.css           → Global styles
│   ├── analysis/             → Document analysis page
│   ├── dashboard/            → Dashboard page
│   └── workspace/            → Workspace page
└── components/
    ├── AuthPortal.tsx         → Full auth system (login, register, forgot password, Google OAuth)
    ├── DocumindLanding.tsx    → Landing page with upload
    ├── DashboardShell.tsx     → Main dashboard with sidebar
    ├── WorkspaceShell.tsx     → Workspace view
    ├── DocMindScroll.tsx      → Animated scroll experience
    └── analysis/             → Analysis-specific components
```

---

## Database Schema

### PostgreSQL Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `documents` | Document metadata | `doc_id` (PK), `user_id`, `filename`, `status`, `total_pages`, `size_bytes` |
| `chunks` | Semantic chunk metadata | `chunk_id` (PK), `doc_id` (FK), `chunk_index`, `token_count`, `full_text`, `metadata` (JSONB) |
| `document_blocks` | Geometry-aware blocks | `block_id` (PK), `doc_id`, `page_number`, `text`, bbox fields, `block_type` |
| `auth_users` | User accounts | `email` (PK), `password_hash`, `auth_provider`, `google_sub` |
| `auth_password_resets` | OTP-based password resets | `email` (FK), `otp_hash`, `reset_token_hash`, `expires_at` |
| `embeddings_map` | Chunk-to-vector mapping | `chunk_id`, `vector_index`, `model_name`, `score` |

---

## Future Scope

### Phase 2 — Processing Queues & Progress Tracking
- Replace background `threading.Thread` with a proper **task queue** (Celery + Redis or RQ).
- When rendering a PDF, show an interactive progress bar: "Processing page 3 of 47 (15%)".
- Surface queue status via WebSocket or SSE push to the frontend.

### Phase 3 — Multi-File Reading
- Support uploading and querying across **multiple documents** simultaneously.
- Cross-document search: "Compare revenue in Q1 report vs Q2 report."
- Document collections / folders with namespace-scoped FAISS indices.

### Phase 4 — Session History & Recall
- Store the **last interaction** of the user: their queries, our responses, and the PDF content.
- When user clicks "Recent Docs" → all history loads, including conversation thread.
- PostgreSQL `sessions` table: `session_id`, `user_id`, `doc_id`, `messages[]`, `created_at`.

### Phase 5 — Information Rules (User Preferences)
- User-configurable retrieval behavior:
  - **Summaries mode**: "Give me the gist of each section."
  - **Numbers mode**: "Focus on financial figures and percentages."
  - **Comparison mode**: "How much % improvement between periods?"
  - **Exhaustive mode**: "Show me everything related to X."
- Rules stored per-user in PostgreSQL, applied as reranking weights.

### Phase 6 — Mathematical Agent
- Dedicated agent for interpreting charts, tables, and numeric data.
- Understands column/row relationships in tables.
- Calculates derived metrics (growth %, averages, trends).
- Provides natural language interpretation: "Revenue grew 12.4% YoY, accelerating from 8.1% in the prior period."
