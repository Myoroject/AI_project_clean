# DocuMind — Known Issues

> Issues identified from a code audit of the repository. Ordered by severity.

---

## 🔴 Critical

### 1. Duplicated `db.py` Content
**File:** `app/db.py`
**Issue:** The entire file content is duplicated — the module is defined twice in the same file (lines 1–67 and lines 68–135). This means the `get_conn()` function and all module-level variables are re-declared. While Python handles this silently (second definition wins), it indicates a merge conflict or accidental paste.

**Impact:** No runtime error, but confusing for maintainers and doubles the file length.

**Fix:** Remove the duplicate block (lines 68–135).

---

### 2. `requirements.txt` Contains Non-Pip Lines
**File:** `app/requirements.txt`
**Issue:** The requirements file mixes pip dependencies with environment variable assignments:
```
REDIS_URL=redis://localhost:6379/0
DOC_TTL_SECONDS=86400
COMPRESS_THRESHOLD=32768
USE_S3_FOR_LARGE=1
S3_BUCKET=my-doc-bucket
S3_THRESHOLD=2242880
```
These are not valid pip requirements and will cause `pip install -r requirements.txt` to fail.

**Impact:** Broken dependency installation.

**Fix:** Move environment variable lines to `.env.example` or `.env`.

---

### 3. Inconsistent PGPASSWORD Defaults
**Files:** `semantic_chunker.py` (line 52), `block_extractor.py` (line 32)
**Issue:** `semantic_chunker.py` defaults `PGPASSWORD` to `"yourpass"`, while `block_extractor.py` defaults it to `"root"`. These modules connect to PostgreSQL independently using their own `get_pg_conn()` / `get_conn()` functions instead of using the centralized `app/db.py` helper.

**Impact:** Connection failures when environment variables aren't set and different defaults are assumed.

**Fix:** Remove standalone connection functions from `semantic_chunker.py` and `block_extractor.py`; import `get_conn` from `app.db` instead.

---

## 🟡 Major

### 4. Background Embedding Uses `threading.Thread`
**File:** `app/upload_flow.py` (line 119)
**Issue:** The background embedding worker runs as a daemon thread. If the Flask process crashes or restarts, the embedding job is silently lost. There is no retry mechanism, no job tracking, and no way to resume.

**Impact:** Uploaded documents may never become searchable if the embedding thread fails.

**Fix (Planned):** Replace with Celery task queue (Phase 2).

---

### 5. Legacy `ai_document.py` Still Present
**File:** `ai_document.py` (525 lines)
**Issue:** This is the original standalone Flask app with inline templates, inline tests, and its own routes. It is completely superseded by the modular `app/` package architecture but still exists at the project root. It uses `pdfminer.six` (which is slower than PyMuPDF) and does not include any of the geometry-aware features.

**Impact:** Confusion about which entry point to use. Risk of someone running the wrong app.

**Fix:** Move to `_deprecated_backup/` or delete entirely.

---

### 6. `auth.py` Is Incomplete
**File:** `app/auth.py` (16 lines)
**Issue:** Contains only the start of a `require_basic_password` function — the function body is incomplete (no return statement, no response when auth fails). The full auth system lives in `app/auth_service.py`.

**Impact:** Dead code. If imported elsewhere, the incomplete function would fail.

**Fix:** Delete `app/auth.py` or complete it as basic auth middleware.

---

### 7. Test File Assumes Redirectless Root Route
**File:** `app/tests/test_routes.py` (line 13)
**Issue:** The test asserts `resp.status_code == 200` and checks for `b"AI Document Search"` in `resp.data`. However, the actual `/` route returns a `redirect("http://localhost:3000")` which is a 302, and the response body won't contain that string.

**Impact:** Test will fail if actually run.

**Fix:** Update test to check for 302 status code and `Location` header.

---

## 🟢 Minor

### 8. `ai_document_working.py` Purpose Unclear
**File:** `ai_document_working.py` (16,066 bytes)
**Issue:** A second legacy/working-copy file at the project root with no documentation about its purpose or how it differs from `ai_document.py` or the current `app/` package.

**Impact:** Confusion for new contributors.

**Fix:** Move to `_deprecated_backup/` with a README explaining its history.

---

### 9. Hardcoded Localhost URLs
**Files:** `app/routes.py` (line 58), `app/__init__.py` (line 24)
**Issue:** Localhost URLs (`http://localhost:3000`) are hardcoded in routes and CORS config. While env vars exist for `NEXTJS_BASE_URL`, they're not used consistently.

**Impact:** Breaks in non-localhost deployment environments.

**Fix:** Use `os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000")` consistently everywhere.

---

### 10. Missing FAISS Index Graceful Recovery
**File:** `app/faiss_index.py` (lines 82–88)
**Issue:** When `add_with_ids` isn't available (some FAISS versions), the code wraps the index in `IndexIDMap` but reassigns via `globals()['_index']`. This is fragile — the module-level `_index` variable should be reassigned directly with `global _index`.

**Impact:** Potential bugs if FAISS version doesn't support `add_with_ids` natively.

**Fix:** Use `global _index` statement and reassign directly.

---

### 11. `print("REDIS_URL=", REDIS_URL)` in Production Code
**File:** `app/redis_client.py` (line 52)
**Issue:** A `print()` statement outputs the Redis URL (which may contain passwords) to stdout on every import.

**Impact:** Security risk — credentials logged in production.

**Fix:** Replace with `logger.debug()` or remove entirely.

---

### 12. No `.gitignore` Entry for Profile Output
**File:** `profile_output/` directory
**Issue:** Profiling output files (`.prof`) are generated in this directory but there's no `.gitignore` protection against accidentally committing large binary profile files.

**Impact:** Repository bloat if profiling is used.

**Fix:** Add `profile_output/` to `.gitignore`.
