# Feature Spec: Document Upload

## Overview
Multi-format document upload supporting JSON, form, and multipart file payloads. The upload path is optimized for speed (<3s) with background embedding deferred to a worker thread.

## Supported Formats

| Format | Extensions | Extraction Method |
|--------|-----------|-------------------|
| PDF | `.pdf` | PyMuPDF (fitz) — text + geometry blocks |
| Word | `.docx` | python-docx — paragraph text |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff` | Tesseract OCR |
| Text | `.txt`, `.csv`, `.md` | Direct UTF-8/Latin-1 read |

**Max file size:** 20 MB (configured in `app/__init__.py`).

## Upload Endpoint

### `POST /upload`

**Authentication:** Required (session-based).

**Input variants:**
1. JSON body: `{ user_id, filename, text }`
2. Form fields: `user_id`, `filename`, `text`
3. Multipart: `file` field with actual file data

**Response (success):**
```json
{ "ok": true, "doc_id": "uuid-string", "filename": "report.pdf", "size": 1234567 }
```

## Processing Pipeline (`upload_flow.py`)

```
User uploads file
    │
    ▼
1. Generate doc_id (UUID4)
    │
    ▼
2. Store full text in Redis
   ├── Small docs: single key `doc:{id}` (gzip if > 32KB)
   └── Large docs: chunked `doc:{id}:chunk:N` with metadata
    │
    ▼
3. Insert document metadata in PostgreSQL
   └── documents(doc_id, user_id, filename, size_bytes, status='uploaded', total_pages)
    │
    ▼
4. Extract geometry blocks (PDF only)
   ├── PyMuPDF page.get_text("blocks")
   ├── Classify: header, footer, paragraph, table, numeric_value, line, empty
   ├── Compute: center, width, height from bounding box
   └── Store in PostgreSQL document_blocks table
    │
    ▼
5. Background thread: embed blocks + store in FAISS
   ├── embedding_service.embed_texts() — BGE-small-en-v1.5
   ├── faiss_index.add_blocks() — HNSW index
   └── ingest_db.update_document_status(doc_id, "ready")
    │
    ▼
Return doc_id to client (< 3 seconds)
```

## Error Handling

| Error | Response |
|-------|----------|
| No auth | 401 `{ ok: false, error: "Authentication required." }` |
| No file or text | 400 `{ error: "no text provided and no file uploaded" }` |
| Empty filename | 400 `{ error: "empty filename or no file" }` |
| Unsupported extension | 400 `{ error: "unsupported file type: .exe" }` |
| Processing failure | 500 `{ ok: false, error: "Upload failed", detail: "..." }` |

## Session Side Effects
- `session["doc_id"]` set to the new document ID.
- `session["filemeta"]` set to `{ name: filename, size: bytes }`.
