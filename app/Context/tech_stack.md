# DocuMind — Tech Stack

## Current Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.10+ | Core backend language |
| **Flask** | ≥ 3.0.0 | Web framework + REST API |
| **Gunicorn** | ≥ 21.2 | Production WSGI HTTP server |
| **Jinja2** | ≥ 3.1 | Server-side template rendering (chat, search pages) |
| **flask-cors** | Latest | Cross-Origin Resource Sharing for Next.js frontend |

### Database & Storage

| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary relational database — documents, chunks, blocks, users, auth |
| **psycopg2** | Python PostgreSQL adapter |
| **Redis** | Fast document text cache with TTL (86400s default), gzip compression |
| **python-dotenv** | Environment variable management from `.env` files |

### AI / ML Pipeline

| Technology | Model | Purpose |
|------------|-------|---------|
| **sentence-transformers** | BAAI/bge-small-en-v1.5 | 384-dim text embeddings (local, no API) |
| **FAISS** | IndexHNSWFlat (32 connections) | Approximate nearest neighbor vector search |
| **spaCy** | en_core_web_sm | Sentence boundary detection for semantic chunking |

### Document Processing

| Technology | Purpose |
|------------|---------|
| **PyMuPDF (fitz)** | PDF text + geometry extraction (primary — faster than PDFMiner) |
| **pdfminer.six** | ≥ 20240706 — Legacy PDF extraction (still in requirements) |
| **PyPDF2** | PDF page counting for metadata |
| **python-docx** | ≥ 1.1.0 — Word document (.docx) text extraction |
| **pytesseract** | ≥ 0.3.10 — OCR for images (PNG, JPG, WEBP, BMP, TIFF) |
| **Pillow** | ≥ 10.3.0 — Image handling for OCR pipeline |

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js** | React framework with file-based routing |
| **TypeScript** | Type-safe frontend development |
| **React** | Component-based UI library |
| **CSS** | Global styles in `globals.css` |

### Security

| Technology | Purpose |
|------------|---------|
| **Werkzeug** | Password hashing (`generate_password_hash` / `check_password_hash`) |
| **Flask sessions** | Cookie-based session management (HttpOnly, SameSite, Secure) |
| **Google OAuth 2.0** | Social login via OpenID Connect |
| **SMTP** | OTP delivery for password resets |

### Dev & Testing

| Technology | Purpose |
|------------|---------|
| **pytest** | ≥ 8.2.0 — Unit testing framework |
| **Werkzeug ProfilerMiddleware** | Request-level profiling (enabled via `FLASK_PROFILE=1`) |

---

## Future Tech Stack

### Phase 2 — Task Queues

| Technology | Purpose |
|------------|---------|
| **Celery** | Distributed task queue for background PDF processing & embedding |
| **Redis (as broker)** | Message broker for Celery workers |
| **WebSockets / SSE** | Real-time progress updates to frontend |

### Phase 3 — Scaling

| Technology | Purpose |
|------------|---------|
| **Docker** | Containerized deployment (Dockerfile already exists) |
| **Docker Compose** | Multi-service orchestration (docker-compose.yml exists) |
| **Nginx** | Reverse proxy (config directory already exists at `app/Nginx/`) |
| **S3-compatible storage** | Large document storage (env vars already configured: `S3_BUCKET`, `S3_THRESHOLD`) |

### Phase 4 — Enhanced AI

| Technology | Purpose |
|------------|---------|
| **Ollama / llama.cpp** | Local LLM inference for natural language answer generation |
| **Hugging Face Transformers** | Advanced model inference if needed |
| **Table structure recognition** | Dedicated table parsing models (e.g., Microsoft Table Transformer) |
| **Chart understanding agent** | Vision model for interpreting chart images |

### Phase 5 — Monitoring & Observability

| Technology | Purpose |
|------------|---------|
| **OpenTelemetry** | Distributed tracing across Flask + worker + DB |
| **Prometheus + Grafana** | Metrics collection and dashboarding |
| **Structured logging (JSON)** | Machine-readable logs for production debugging |
