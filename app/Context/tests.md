# DocuMind — Testing Plan

## Testing Philosophy

Every feature is tested at three levels before code changes are committed:

1. **Unit Tests** — Isolated function testing with mocked dependencies.
2. **Integration Tests** — End-to-end route testing with real Flask test client.
3. **Manual Verification** — Browser-based smoke testing of UI flows.

---

## Unit Tests

### Authentication (`test_auth.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_register_valid_user` | Registration with valid email + strong password creates user in DB |
| `test_register_duplicate_email` | Re-registering existing email returns appropriate error |
| `test_register_weak_password` | Password failing any rule (length, case, digit, special) returns failure list |
| `test_login_valid_credentials` | Correct email + password returns user and sets session |
| `test_login_invalid_password` | Wrong password returns "Invalid email or password" |
| `test_login_nonexistent_user` | Email not in DB returns same "Invalid email or password" (no user enumeration) |
| `test_google_oauth_upsert` | Google OAuth creates new user or links to existing password account |
| `test_password_reset_otp_flow` | Full OTP cycle: request → verify → reset |
| `test_expired_otp` | OTP past `expires_at` returns "That OTP has expired" |
| `test_email_validation` | Valid/invalid email formats correctly identified |
| `test_password_validation` | Each password rule tested independently |

### Document Upload (`test_upload.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_upload_pdf_stores_in_redis` | PDF bytes are extracted and stored via `put_doc_text` |
| `test_upload_txt_returns_doc_id` | Plain text upload returns valid UUID doc_id |
| `test_upload_unsupported_ext` | `.exe` file returns 400 with "unsupported file type" |
| `test_upload_empty_file` | Empty filename/no file returns 400 |
| `test_upload_json_body` | JSON body with `{ text, filename }` succeeds |
| `test_upload_requires_auth` | Upload without session returns 401 |
| `test_handle_text_upload_creates_metadata` | `insert_document` called with correct params |
| `test_handle_text_upload_extracts_blocks` | PDF upload triggers `process_document` |

### Retrieval Pipeline (`test_retrieval.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_embed_query_shape` | `embed_query` returns float32 array of shape (384,) |
| `test_embed_texts_batch` | `embed_texts` returns (N, 384) array for N inputs |
| `test_faiss_add_and_search` | Adding vectors then searching returns correct block_ids |
| `test_geometry_reranking_table_bonus` | Table blocks rank higher than equivalent paragraphs |
| `test_geometry_reranking_body_position` | Body content (y1 50-750) gets position bonus |
| `test_geometry_reranking_area_bonus` | Large area blocks get +0.10 boost |
| `test_search_empty_query` | Empty query string returns empty list |
| `test_cosine_to_l2_conversion` | L2 distance correctly converted to cosine similarity |

### Block Extractor (`test_block_extractor.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_classify_footer` | Text at y > 90% page height → "footer" |
| `test_classify_header` | Short uppercase text at y < 10% → "header" |
| `test_classify_table` | Multi-line text with delimiters → "table" |
| `test_classify_paragraph` | Multi-line text without delimiters → "paragraph" |
| `test_classify_empty` | Empty text → "empty" |
| `test_extract_blocks_from_pdf` | Real PDF bytes produce DocumentBlock list with valid geometry |

### Semantic Chunker (`test_chunker.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_detect_blocks_from_text` | Paragraph boundaries correctly detected |
| `test_tag_block_types` | Figure captions, equations, tables correctly tagged |
| `test_overlapping_windows` | Windows generated with correct overlap |
| `test_clean_text_for_spacy` | UTF-16 surrogates replaced, NFC normalized |
| `test_build_chunks_dry_run` | Full pipeline runs without DB writes in dry_run mode |

### Redis Client (`test_redis_client.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_put_get_roundtrip` | `put_doc_text` → `get_doc_text` returns identical text |
| `test_gzip_compression` | Docs > 32KB are stored with gzip prefix |
| `test_clear_doc` | After `clear_doc`, `get_doc_text` returns empty |
| `test_inmemory_fallback` | When Redis unavailable, in-memory dict used |
| `test_ttl_expiration` | Expired docs return empty (in-memory fallback) |

---

## Integration Tests

### Route Tests (`test_routes_integration.py`)

| Test | What It Verifies |
|------|-----------------|
| `test_health_check` | `GET /healthz` returns `{ ok: true, redis: bool }` |
| `test_root_redirects_to_nextjs` | `GET /` returns 302 to `http://localhost:3000` |
| `test_upload_and_ask_flow` | Upload file → ask question → get answer (full pipeline) |
| `test_auth_flow` | Register → login → access protected endpoint → logout |
| `test_document_api` | Upload → `GET /api/document/<doc_id>` returns document data |
| `test_reset_clears_session` | `GET /reset` clears session and Redis data |

---

## Manual Verification

### Pre-Commit Checklist

- [ ] Start both servers (`npm run dev` + `flask run`).
- [ ] Register a new account via AuthPortal.
- [ ] Login with the new account.
- [ ] Upload a PDF document.
- [ ] Verify redirect to chat/analysis page.
- [ ] Ask a question and verify evidence-based answer.
- [ ] Click "New Document" and verify return to landing page.
- [ ] Check `/healthz` endpoint for Redis status.
- [ ] Verify Google OAuth flow (if configured).
- [ ] Test forgot password flow (dev mode: OTP shown in console).

---

## Test Commands

```bash
# Run all tests
pytest app/tests/ -v

# Run with coverage
pytest app/tests/ --cov=app --cov-report=term-missing

# Run specific test file
pytest app/tests/test_auth.py -v

# Run with profiling output
FLASK_PROFILE=1 pytest app/tests/ -v
```
