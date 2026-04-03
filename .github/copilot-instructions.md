## Purpose
Give immediate, code-aware guidance to AI coding agents working on this repo.

## Big picture
- Backend: Flask app in [app](app) (factory in [app/__init__.py](app/__init__.py)). Entry for WSGI is [app/wsgi.py](app/wsgi.py).
- Frontend: Next.js app in [frontend](frontend) (dev on port 3000). See [frontend/package.json](frontend/package.json).
- Data flow: upload → `handle_text_upload` ([app/upload_flow.py](app/upload_flow.py)) → `put_doc_text` ([app/redis_client.py](app/redis_client.py)) → `insert_document`/`insert_chunks_bulk` ([app/ingest_db.py](app/ingest_db.py)). Chunking is delegated to `semantic_chunker.build_chunks_from_redis`.

## Key integration points & conventions
- Redis: configured via `REDIS_URL` (or in-memory fallback). Keys use the `doc:{doc_id}` prefix. Compression and chunking handled in [app/redis_client.py](app/redis_client.py).
- Postgres: `DATABASE_URL` (or `PG_*` vars) loaded by [app/db.py](app/db.py).
- File ingest: support for PDF/DOCX/images via [app/storage.py](app/storage.py). OCR/PDF features are optional and guarded by imports.
- Chunk shape expected by DB: include `chunk_index`, `redis_key`, `stored_bytes`, optional `text_preview` and `token_count` — see [app/ingest_db.py](app/ingest_db.py).
- Session usage: UI stores `filemeta` and `doc_id` in Flask `session` for simple flow (see [app/routes.py](app/routes.py)).

## Developer workflows (how to run & test)
- Create & activate a Python venv, then install backend deps:

  PowerShell:
  ```powershell
  & .\.venv\Scripts\Activate.ps1
  pip install -r app/requirements.txt
  ```

- Set up `.env` (project root) with `DATABASE_URL` and `REDIS_URL` as needed. `app/db.py` auto-loads `.env`.
- Run backend (dev):

  ```powershell
  # option A - run Flask directly
  flask --app app run --port 5000

  # option B - run combined dev (from frontend):
  cd frontend
  npm run dev:all  # runs Flask + Next.js concurrently
  ```

- Run frontend only:
  ```bash
  cd frontend
  npm install
  npm run dev
  ```

- Run tests: `pytest` at repo root (there is `tests/test_routes.py`).

## Code patterns agents should follow
- When adding features that touch documents, use `handle_text_upload` as the canonical ingest path (it writes Redis + DB + builds chunks).
- Prefer reading/using `redis_client` helpers for doc storage/reads; keys and behavior (single-key vs chunked gz) are centralized there.
- When writing DB rows for chunks or embeddings, follow `insert_chunks_bulk` and `insert_embeddings_map_bulk` call shapes to avoid FK/race conditions; prefer using the DB helper functions in [app/ingest_db.py](app/ingest_db.py).
- Use `semantic_chunker.build_chunks_from_redis` (if present) for consistent chunking; code expects `dry_run=True` for preview/validation flows.

## Environment flags & behavior toggles
- `FLASK_DEBUG`, `FLASK_SECRET_KEY` / `SECRET_KEY` — Flask config ([app/__init__.py](app/__init__.py)).
- `FLASK_PROFILE=1` enables Werkzeug Profiler and writes `.prof` files to `/profile_output`.
- Redis-related envs: `REDIS_URL`, `DOC_TTL_SECONDS`, `COMPRESS_THRESHOLD`, `REDIS_CHUNK_SIZE`.

## Quick API reference (examples)
- Upload text (JSON): POST `/upload` with `{ user_id, filename, text }` → returns `{doc_id}`.
- Frontend fetches document JSON: GET `/api/document/<doc_id>` (used by Next.js UI).
- Chat endpoint: POST `/ask` with `{ question, doc_id }`.

## Helpful files to inspect when making changes
- Routing & UI: [app/routes.py](app/routes.py)
- Ingest flow: [app/upload_flow.py](app/upload_flow.py)
- Redis storage: [app/redis_client.py](app/redis_client.py)
- DB ingestion: [app/ingest_db.py](app/ingest_db.py)
- Storage/parsers: [app/storage.py](app/storage.py)
- Next frontend: [frontend/package.json](frontend/package.json) and [frontend/app](frontend/app)

If any part of this summary is unclear or you want the agent to include more examples (e.g., exact SQL schemas or a typical chunk payload), tell me what to expand. 
