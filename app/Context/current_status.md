# DocuMind — Current Status & Future Scope

## Current Status: Alpha (Active Development)

### ✅ Completed Features

#### Authentication System
- [x] Email + password registration with strong password rules (12+ chars, mixed case, digit, special).
- [x] Email + password login with bcrypt hash verification.
- [x] Google OAuth 2.0 sign-in with hybrid account linking (password + Google).
- [x] Forgot password flow: OTP via SMTP (or dev-mode console preview).
- [x] Session management with hardened cookies (HttpOnly, SameSite, Secure).
- [x] Logout with full session cleanup.

#### Document Upload & Processing
- [x] Multi-format upload: PDF, DOCX, PNG/JPG/WEBP/BMP/TIFF (OCR), TXT, CSV, MD.
- [x] Three upload modes: JSON body, form fields, multipart file upload.
- [x] Fast upload path (<3s target): Redis storage → PostgreSQL metadata → geometry extraction → background embedding.
- [x] PDF text extraction via PyMuPDF (fitz) with block-level geometry.
- [x] OCR for images via Tesseract.
- [x] Gzip compression for documents > 32KB in Redis.
- [x] Chunked storage in Redis for documents > 100MB.

#### Geometry-Aware Block Extraction
- [x] Full bounding box extraction from PDFs: `(x1, y1, x2, y2)`, center, width, height.
- [x] Deterministic block type classification: header, footer, paragraph, table, numeric_value, table_cell, line, empty.
- [x] PostgreSQL persistence with indexes on `(doc_id, page_number)`, `block_type`, `parent_block_id`.
- [x] Same-row block retrieval by center-y tolerance.

#### Semantic Search Pipeline
- [x] BGE-small-en-v1.5 embedding model (384-dim, runs locally).
- [x] FAISS HNSW vector index with thread-safe access.
- [x] Deterministic geometry-based reranking (cosine 60% + block type + position + area).
- [x] Evidence-first answer format: page number, block type, source text.
- [x] Fallback to naive keyword search when retrieval pipeline is unavailable.

#### Semantic Chunker
- [x] spaCy-based sentence boundary detection.
- [x] Block detection from text with paragraph boundary parsing.
- [x] Block type tagging: figure_caption, equation, table, numeric_table, text.
- [x] Overlapping window generation for context preservation.
- [x] Multi-source text acquisition (Redis → client → PDF bytes → PDF path → env fallback).
- [x] Unicode sanitization (handles UTF-16 surrogates, NFC normalization).

#### Frontend
- [x] Next.js app with file-based routing.
- [x] Auth portal component (login, register, forgot password, Google OAuth).
- [x] Landing page with animated document upload.
- [x] Dashboard shell with sidebar navigation.
- [x] Workspace view.
- [x] Chat UI (Jinja2 template served by Flask).

#### Infrastructure
- [x] Dual-server architecture: Flask (5000) + Next.js (3000).
- [x] CORS configuration for cross-origin API calls.
- [x] Health check endpoint (`/healthz`) with Redis connectivity status.
- [x] In-memory fallback when Redis is unavailable.
- [x] Dockerfile and docker-compose.yml for containerized deployment.
- [x] Profiling middleware (Werkzeug) toggle via `FLASK_PROFILE=1`.
- [x] Dev startup scripts: `run-dev.bat`, `run-dev.ps1`, `start-servers.bat`, `start-servers.ps1`.

---

### ⚠️ Partially Implemented

| Feature | Status | What's Left |
|---------|--------|-------------|
| Background embedding | Runs via `threading.Thread` | Needs proper task queue (Celery) |
| Chat interface | Jinja2 template + naive search fallback | Needs Next.js chat component + LLM integration |
| Document status tracking | `uploaded` → `ready` / `error` | No frontend status polling |
| S3 storage | Env vars configured but not used | Needs actual S3 client integration |

---

### ❌ Not Yet Started

| Feature | Planned Phase |
|---------|---------------|
| Processing progress bar (WebSocket/SSE) | Phase 2 |
| Multi-file simultaneous search | Phase 3 |
| Conversation history persistence | Phase 4 |
| Information rules / user preferences | Phase 5 |
| Mathematical agent (chart/table interpretation) | Phase 6 |
| Local LLM integration (Ollama / llama.cpp) | Phase 4 |
| Production deployment with Nginx | Phase 3 |

---

## Future Scope — Detailed Roadmap

### Phase 2: Processing Queues & Real-Time Progress
**Goal:** Replace threading with Celery; show users exactly how far along their document is.

- Replace `threading.Thread` in `upload_flow.py` with Celery tasks.
- Add Redis-backed progress tracking: `doc:{id}:progress = {"pages_done": 12, "total": 47, "step": "embedding"}`.
- Frontend WebSocket connection for real-time progress bar.
- Retry logic for failed embedding tasks.

### Phase 3: Multi-File & Deployment
**Goal:** Query across document collections; production-ready deployment.

- Multi-document upload with collection/folder grouping.
- Cross-document semantic search with namespace-scoped FAISS indices.
- Nginx reverse proxy configuration (directory already exists).
- Docker Compose production profile with health checks.
- S3 integration for large document persistence.

### Phase 4: Session History & LLM Integration
**Goal:** Remember conversations; generate natural language answers.

- `sessions` table: `session_id`, `user_id`, `doc_id`, `messages[]`, `created_at`.
- "Recent Docs" UI that loads full conversation history.
- Local LLM integration (Ollama preferred) for answer generation.
- Evidence-first answer template: LLM receives retrieved blocks + generates natural language summary.

### Phase 5: Information Rules
**Goal:** Let users customize how they receive information.

- Per-user preference rules stored in PostgreSQL.
- Rule types: summaries, numbers-focus, comparisons, exhaustive.
- Rules applied as reranking weight multipliers in `retrieval.py`.
- UI settings panel in WorkspaceShell component.

### Phase 6: Mathematical Agent
**Goal:** Intelligent interpretation of numeric data, tables, and charts.

- Table structure recognition (row/column relationships).
- Derived metric calculation (growth %, averages, trends).
- Chart image analysis using vision models.
- Natural language explanations: "Revenue grew 12.4% YoY."
